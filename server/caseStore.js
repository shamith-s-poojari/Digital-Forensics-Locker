// Server-side case store: the off-chain titles and descriptions of cases, as an append-only version history.
//
// Endpoints (mounted by vite.config.js; all need a wallet sign-in session, because titles are sensitive):
//   GET  /api/cases                 -> { cases: Case[] }
//   GET  /api/cases/:caseRef        -> Case
//   POST /api/cases                 { caseNumber, title, description } -> 201 Case      (creates version 1)
//   POST /api/cases/:caseRef/versions { title, description } -> 201 Case               (appends a version)
//
//   Case    = { caseRef, caseNumber, createdBy, createdAt, versions: Version[] }   oldest version first
//   Version = { version, title, description, salt, digest, editedBy, editedAt }
//
// No endpoint edits or deletes a version. Each version's digest (src/cases/caseDigest.js) is what evidence records
// anchor on chain, so an edit made behind this API's back (in the file, or by a compromised server) leaves anchored
// digests that no version reproduces any more, and the dashboard reports it. Clients recompute digests from the
// fields; the stored `digest` is a convenience, not trusted.
//
// Roles (server/chainRoles.js, via `checkRole`): reading needs the view capability (any role); creating and editing
// need the upload capability (Investigator), matching the UI.
//
// LIMITS (development build): a JSON file for one process.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { computeCaseDigest, normaliseText } from "../src/cases/caseDigest.js";
import { deriveCaseRef } from "../src/web3/format.js";
import { CAPABILITIES } from "../src/web3/roles.js";
import { allowAll } from "./chainRoles.js";
import { isSameSiteRequest } from "./siweAuth.js";

const CASE_REF = /^0x[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 16 * 1024;
export const LIMITS = Object.freeze({ caseNumber: 64, title: 200, description: 4000 });

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > limit) {
        reject(Object.assign(new Error("Request body too large"), { code: "TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** Validates the editable fields. Returns { title, description } or an error message. */
function readFields(body) {
  const title = normaliseText(body?.title);
  const description = normaliseText(body?.description);
  if (!title) return { error: "A case title is required." };
  if (title.length > LIMITS.title) return { error: `The title is longer than ${LIMITS.title} characters.` };
  if (description.length > LIMITS.description) return { error: `The description is longer than ${LIMITS.description} characters.` };
  return { title, description };
}

/**
 * @param {object} options
 * @param {string} options.filePath
 * @param {(req) => ({ address: string } | null)} options.getSession
 * @param {(session, capability: string) => Promise<null | { status: number, error: string }>} [options.checkRole]
 *        From server/chainRoles.js. Defaults to no role checks.
 * @param {() => number} [options.now]
 */
export function createCaseStore({ filePath, getSession, checkRole = allowAll, now = Date.now }) {
  let loading = null;
  let writeChain = Promise.resolve();

  function cases() {
    loading ??= readFile(filePath, "utf8")
      .then((text) => new Map(Object.entries(JSON.parse(text).cases ?? {})))
      .catch((err) => {
        if (err?.code === "ENOENT") return new Map();
        loading = null; // never replace an unreadable file with an empty store
        throw err;
      });
    return loading;
  }

  function persist(map) {
    writeChain = writeChain.then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ version: 1, cases: Object.fromEntries(map) }, null, 2), { mode: 0o600 });
      await rename(tmp, filePath);
    });
    return writeChain;
  }

  function makeVersion(entry, number, { title, description }, address) {
    const salt = randomBytes(32).toString("hex");
    return {
      version: number,
      title,
      description,
      salt,
      digest: computeCaseDigest({ caseRef: entry.caseRef, caseNumber: entry.caseNumber, title, description, salt }),
      editedBy: address,
      editedAt: new Date(now()).toISOString(),
    };
  }

  async function create(req, res, session) {
    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
    } catch (err) {
      return sendJson(res, err?.code === "TOO_LARGE" ? 413 : 400, { error: "Expected a JSON body." });
    }
    const caseNumber = normaliseText(body?.caseNumber).toUpperCase();
    if (!caseNumber || caseNumber.length > LIMITS.caseNumber) return sendJson(res, 400, { error: "A case number (up to 64 characters) is required." });
    const fields = readFields(body);
    if (fields.error) return sendJson(res, 400, { error: fields.error });

    const map = await cases();
    const caseRef = deriveCaseRef(caseNumber);
    if (map.has(caseRef)) return sendJson(res, 409, { error: "This case already exists. Edit it instead." });

    const entry = { caseRef, caseNumber, createdBy: session.address, createdAt: new Date(now()).toISOString(), versions: [] };
    entry.versions.push(makeVersion(entry, 1, fields, session.address));
    map.set(caseRef, entry);
    try {
      await persist(map);
    } catch (err) {
      map.delete(caseRef);
      throw err;
    }
    return sendJson(res, 201, entry);
  }

  async function appendVersion(req, res, session, caseRef) {
    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
    } catch (err) {
      return sendJson(res, err?.code === "TOO_LARGE" ? 413 : 400, { error: "Expected a JSON body." });
    }
    const fields = readFields(body);
    if (fields.error) return sendJson(res, 400, { error: fields.error });
    const entry = (await cases()).get(caseRef);
    if (!entry) return sendJson(res, 404, { error: "No such case." });

    const current = entry.versions[entry.versions.length - 1];
    if (current.title === fields.title && current.description === fields.description) return sendJson(res, 200, entry); // nothing changed

    const version = makeVersion(entry, current.version + 1, fields, session.address);
    entry.versions.push(version);
    try {
      await persist(await cases());
    } catch (err) {
      entry.versions.pop();
      throw err;
    }
    return sendJson(res, 201, entry);
  }

  /**
   * Routes /api/cases requests. Returns false (without responding) for any other path.
   *
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async function handle(req, res) {
    const path = req.url?.split("?")[0] ?? "";
    if (path !== "/api/cases" && !path.startsWith("/api/cases/")) return false;

    if (!isSameSiteRequest(req)) {
      sendJson(res, 403, { error: "Request rejected." });
      return true;
    }
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "Sign in with your wallet first." });
      return true;
    }

    const [, , , caseRef, sub] = path.split("/"); // "", "api", "cases", caseRef, "versions"
    if (caseRef !== undefined && !CASE_REF.test(caseRef)) {
      sendJson(res, 400, { error: "Malformed case reference." });
      return true;
    }
    if (req.method === "GET" || req.method === "POST") {
      const denied = await checkRole(session, req.method === "GET" ? CAPABILITIES.VIEW : CAPABILITIES.UPLOAD);
      if (denied) {
        sendJson(res, denied.status, { error: denied.error });
        return true;
      }
    }

    if (req.method === "GET" && !caseRef) sendJson(res, 200, { cases: [...(await cases()).values()] });
    else if (req.method === "POST" && !caseRef) await create(req, res, session);
    else if (req.method === "GET" && caseRef && !sub) {
      const entry = (await cases()).get(caseRef);
      if (entry) sendJson(res, 200, entry);
      else sendJson(res, 404, { error: "No such case." });
    } else if (req.method === "POST" && caseRef && sub === "versions") await appendVersion(req, res, session, caseRef);
    else sendJson(res, 405, { error: "Method not allowed." });
    return true;
  }

  return { handle };
}
