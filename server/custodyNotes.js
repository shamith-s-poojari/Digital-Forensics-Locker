// Server-side custody notes: the text behind the noteHash of a custody entry on chain (src/custody/custodyNote.js).
//
// Endpoints (mounted by server/api.js; all need a wallet sign-in session, because notes are sensitive):
//   GET  /api/custody-notes?evidence=:id          -> { notes: Note[] }   oldest first
//   POST /api/custody-notes { evidenceId, note, branchId? } -> 201 Note
//
//   Note = { noteHash, evidenceId, branchId, note, salt, author, createdAt }
//
// The note is saved first and the browser then sends its noteHash in the custody transaction. A note whose transaction
// never happens is harmless: the dashboard shows a note only for an on-chain entry whose hash its fields reproduce. No
// endpoint edits or deletes a note. The author is the signed-in wallet, never a field of the request.
//
// Roles (server/chainRoles.js, via `checkRole`): reading needs the view capability (any role); adding needs a role that
// can write custody entries (Investigator, or the Chief reassigning custody). Branches (via `readScope`): the Chief
// reads every note; anyone else only its own branch's. An Investigator's note takes the Investigator's branch; the
// Chief, who has none of its own, says which branch the evidence belongs to.
//
// Storage: server/storage/ (JSON files in development, Postgres when DATABASE_URL is set).

import { randomBytes } from "node:crypto";
import { normaliseText } from "../src/cases/caseDigest.js";
import { computeNoteHash, MAX_NOTE_LENGTH } from "../src/custody/custodyNote.js";
import { CAPABILITIES, inBranchScope } from "../src/web3/roles.js";
import { allowAll, globalScope } from "./chainRoles.js";
import { isSameSiteRequest } from "./siweAuth.js";

const MAX_BODY_BYTES = 16 * 1024;
const PATH = "/api/custody-notes";
const isId = (value) => Number.isSafeInteger(value) && value > 0;

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

/**
 * @param {object} options
 * @param {object} options.storage  The `custodyNotes` part of a storage (server/storage/fileStorage.js).
 * @param {(req) => ({ address: string } | null)} options.getSession
 * @param {(session, capability: string) => Promise<null | { status: number, error: string }>} [options.checkRole]
 *        From server/chainRoles.js. Defaults to no role checks.
 * @param {(session) => Promise<{ global: boolean, branchId: number | null }>} [options.readScope]
 *        From server/chainRoles.js. Defaults to every branch.
 * @param {() => number} [options.now]
 */
export function createCustodyNoteStore({ storage, getSession, checkRole = allowAll, readScope = globalScope, now = Date.now }) {
  async function list(req, res, session) {
    const denied = await checkRole(session, CAPABILITIES.VIEW);
    if (denied) return sendJson(res, denied.status, { error: denied.error });
    const evidenceId = Number(new URL(req.url, "http://localhost").searchParams.get("evidence"));
    if (!isId(evidenceId)) return sendJson(res, 400, { error: "Say which evidence item: ?evidence=<id>." });
    const scope = await readScope(session);
    return sendJson(res, 200, { notes: (await storage.listFor(evidenceId)).filter((n) => inBranchScope(scope, n.branchId)) });
  }

  async function add(req, res, session) {
    const denied = await checkRole(session, CAPABILITIES.LOG_CUSTODY);
    if (denied && (await checkRole(session, CAPABILITIES.REASSIGN))) return sendJson(res, denied.status, { error: denied.error });

    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
    } catch (err) {
      return sendJson(res, err?.code === "TOO_LARGE" ? 413 : 400, { error: "Expected a JSON body." });
    }
    const evidenceId = body?.evidenceId;
    if (!isId(evidenceId)) return sendJson(res, 400, { error: "A valid evidence id is required." });
    const note = normaliseText(body?.note);
    if (!note) return sendJson(res, 400, { error: "A note cannot be empty." });
    if (note.includes("\0")) return sendJson(res, 400, { error: "The note contains an invalid character." });
    if (note.length > MAX_NOTE_LENGTH) return sendJson(res, 400, { error: `The note is longer than ${MAX_NOTE_LENGTH} characters.` });

    const scope = await readScope(session);
    const requested = body?.branchId ?? null;
    if (scope.global && requested !== null && !isId(requested)) return sendJson(res, 400, { error: "Malformed branch id." });
    if (!scope.global && scope.branchId === null) return sendJson(res, 403, { error: "Your wallet does not belong to a branch." });

    const salt = randomBytes(32).toString("hex");
    const entry = {
      noteHash: computeNoteHash({ evidenceId, author: session.address, note, salt }),
      evidenceId,
      branchId: scope.global ? requested : scope.branchId,
      note,
      salt,
      author: session.address,
      createdAt: new Date(now()).toISOString(),
    };
    await storage.insert(entry); // the salt is fresh, so the hash cannot be taken
    return sendJson(res, 201, entry);
  }

  /**
   * Routes /api/custody-notes requests. Returns false (without responding) for any other path.
   *
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async function handle(req, res) {
    if (req.url?.split("?")[0] !== PATH) return false;

    if (!isSameSiteRequest(req)) {
      sendJson(res, 403, { error: "Request rejected." });
      return true;
    }
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "Sign in with your wallet first." });
      return true;
    }

    if (req.method === "GET") await list(req, res, session);
    else if (req.method === "POST") await add(req, res, session);
    else sendJson(res, 405, { error: "Method not allowed." });
    return true;
  }

  return { handle };
}
