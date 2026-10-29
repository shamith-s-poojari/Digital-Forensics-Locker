// Server-side access requests: a wallet with no role asks for one in a branch.
//
// Endpoints (mounted by vite.config.js; all need a wallet sign-in session, which proves the caller's address):
//   GET  /api/access-requests/mine        -> { request: Request | null }   the caller's latest request
//   GET  /api/access-requests             -> { requests: Request[] }       pending requests in the caller's scope, oldest first
//   POST /api/access-requests             { role, branchId, reason } -> 201 Request  replaces the caller's pending request
//   POST /api/access-requests/:id/resolve { status: "approved" | "rejected" } -> Request
//
//   Request = { id, address, role, branchId, reason, status, createdAt, resolvedBy, resolvedAt }
//
// A request grants nothing: roles exist only on the contract, which the Chief or a Branch Admin changes with a
// transaction the contract checks. Resolving a request is bookkeeping.
//
// Roles (server/chainRoles.js, via `checkRole` and `readScope`): any signed-in wallet may submit and read its own
// request (that is who requests are for); listing and resolving need the manage-roles capability (Chief or Branch
// Admin). The Chief sees and decides every branch's requests; a Branch Admin only working-role requests for its own
// branch (isRequestInScope), and a request for the Branch Admin role needs the Chief, as on the contract.
//
// LIMITS (development build): a JSON file for one process.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isRequestInScope, readRequestFields } from "../src/access/accessRequestStores.js";
import { sameAddress } from "../src/web3/format.js";
import { CAPABILITIES } from "../src/web3/roles.js";
import { allowAll, globalScope } from "./chainRoles.js";
import { isSameSiteRequest } from "./siweAuth.js";

const MAX_BODY_BYTES = 4 * 1024;
const ID = /^[0-9a-f-]{36}$/;

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
 * @param {string} options.filePath
 * @param {(req) => ({ address: string } | null)} options.getSession
 * @param {(session, capability: string) => Promise<null | { status: number, error: string }>} [options.checkRole]
 *        From server/chainRoles.js. Defaults to no role checks.
 * @param {(session) => Promise<{ global: boolean, branchId: number | null }>} [options.readScope]
 *        From server/chainRoles.js. Defaults to every branch.
 * @param {() => number} [options.now]
 */
export function createAccessRequestStore({ filePath, getSession, checkRole = allowAll, readScope = globalScope, now = Date.now }) {
  let loading = null;
  let writeChain = Promise.resolve();

  function requests() {
    loading ??= readFile(filePath, "utf8")
      .then((text) => JSON.parse(text).requests ?? [])
      .catch((err) => {
        if (err?.code === "ENOENT") return [];
        loading = null; // never replace an unreadable file with an empty store
        throw err;
      });
    return loading;
  }

  function persist(list) {
    writeChain = writeChain.then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ version: 1, requests: list }, null, 2), { mode: 0o600 });
      await rename(tmp, filePath);
    });
    return writeChain;
  }

  async function body(req, res) {
    try {
      return await readJson(req, MAX_BODY_BYTES);
    } catch (err) {
      sendJson(res, err?.code === "TOO_LARGE" ? 413 : 400, { error: "Expected a JSON body." });
      return null;
    }
  }

  async function submit(req, res, session) {
    const input = await body(req, res);
    if (!input) return;
    const fields = readRequestFields(input);
    if (fields.error) return sendJson(res, 400, { error: fields.error });

    const list = await requests();
    const previous = list.findIndex((r) => r.status === "pending" && sameAddress(r.address, session.address));
    const removed = previous >= 0 ? list.splice(previous, 1)[0] : null;
    const request = { id: randomUUID(), address: session.address, ...fields, status: "pending", createdAt: new Date(now()).toISOString(), resolvedBy: null, resolvedAt: null };
    list.push(request);
    try {
      await persist(list);
    } catch (err) {
      list.pop();
      if (removed) list.splice(previous, 0, removed);
      throw err;
    }
    return sendJson(res, 201, request);
  }

  async function resolveRequest(req, res, session, id) {
    const input = await body(req, res);
    if (!input) return;
    if (input.status !== "approved" && input.status !== "rejected") return sendJson(res, 400, { error: "Decision must be approved or rejected." });
    const request = (await requests()).find((r) => r.id === id);
    if (!request) return sendJson(res, 404, { error: "No such request." });
    const denied = await checkRole(session, request.role === "admin" ? CAPABILITIES.MANAGE_ADMINS : CAPABILITIES.MANAGE_ROLES);
    if (denied) return sendJson(res, denied.status, { error: denied.error });
    // Answered like a missing request, so a Branch Admin cannot probe other branches' request ids.
    if (!isRequestInScope(request, await readScope(session))) return sendJson(res, 404, { error: "No such request." });

    const before = { ...request };
    Object.assign(request, { status: input.status, resolvedBy: session.address, resolvedAt: new Date(now()).toISOString() });
    try {
      await persist(await requests());
    } catch (err) {
      Object.assign(request, before);
      throw err;
    }
    return sendJson(res, 200, request);
  }

  /**
   * Routes /api/access-requests requests. Returns false (without responding) for any other path.
   *
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async function handle(req, res) {
    const path = req.url?.split("?")[0] ?? "";
    if (path !== "/api/access-requests" && !path.startsWith("/api/access-requests/")) return false;

    if (!isSameSiteRequest(req)) {
      sendJson(res, 403, { error: "Request rejected." });
      return true;
    }
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "Sign in with your wallet first." });
      return true;
    }

    const [, , , id, sub] = path.split("/"); // "", "api", "access-requests", id | "mine", "resolve"
    if (req.method === "GET" && !id) {
      const denied = await checkRole(session, CAPABILITIES.MANAGE_ROLES);
      if (denied) sendJson(res, denied.status, { error: denied.error });
      else {
        const scope = await readScope(session);
        sendJson(res, 200, { requests: (await requests()).filter((r) => r.status === "pending" && isRequestInScope(r, scope)) });
      }
    } else if (req.method === "GET" && id === "mine" && !sub) {
      sendJson(res, 200, { request: (await requests()).findLast((r) => sameAddress(r.address, session.address)) ?? null });
    } else if (req.method === "POST" && !id) {
      await submit(req, res, session);
    } else if (req.method === "POST" && id && sub === "resolve") {
      if (!ID.test(id)) sendJson(res, 400, { error: "Malformed request id." });
      else await resolveRequest(req, res, session, id);
    } else {
      sendJson(res, 405, { error: "Method not allowed." });
    }
    return true;
  }

  return { handle };
}
