// Server-side access requests: a wallet with no role asks for one in a branch.
//
// Endpoints (mounted by vite.config.js; all need a wallet sign-in session, which proves the caller's address):
//   GET  /api/access-requests/mine        -> { request: Request | null }   the caller's latest request
//   GET  /api/access-requests             -> { requests: Request[] }       pending requests in the caller's scope, oldest first
//   POST /api/access-requests             { role, branchId, reason } -> 201 Request  replaces the caller's pending request
//   POST /api/access-requests/:id/resolve { status: "approved" | "rejected" } -> Request  (409 once decided)
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
// Storage: server/storage/ (JSON files in development, Postgres when DATABASE_URL is set).

import { randomUUID } from "node:crypto";
import { isRequestInScope, readRequestFields } from "../src/access/accessRequestStores.js";
import { CAPABILITIES } from "../src/web3/roles.js";
import { allowAll, globalScope } from "./chainRoles.js";
import { isSameSiteRequest } from "./siweAuth.js";

const MAX_BODY_BYTES = 4 * 1024;

const alreadyDecided = (request) =>
  request && request.status !== "pending"
    ? `This request was already ${request.status} by ${request.resolvedBy}. A decision cannot be changed; the wallet can submit a new request.`
    : "This request is no longer pending.";
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
 * @param {object} options.storage  The `accessRequests` part of a storage (server/storage/fileStorage.js).
 * @param {(req) => ({ address: string } | null)} options.getSession
 * @param {(session, capability: string) => Promise<null | { status: number, error: string }>} [options.checkRole]
 *        From server/chainRoles.js. Defaults to no role checks.
 * @param {(session) => Promise<{ global: boolean, branchId: number | null }>} [options.readScope]
 *        From server/chainRoles.js. Defaults to every branch.
 * @param {() => number} [options.now]
 */
export function createAccessRequestStore({ storage, getSession, checkRole = allowAll, readScope = globalScope, now = Date.now }) {
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

    const request = { id: randomUUID(), address: session.address, ...fields, status: "pending", createdAt: new Date(now()).toISOString(), resolvedBy: null, resolvedAt: null };
    await storage.replacePending(request);
    return sendJson(res, 201, request);
  }

  async function resolveRequest(req, res, session, id) {
    const input = await body(req, res);
    if (!input) return;
    if (input.status !== "approved" && input.status !== "rejected") return sendJson(res, 400, { error: "Decision must be approved or rejected." });
    const request = await storage.get(id);
    if (!request) return sendJson(res, 404, { error: "No such request." });
    const denied = await checkRole(session, request.role === "admin" ? CAPABILITIES.MANAGE_ADMINS : CAPABILITIES.MANAGE_ROLES);
    if (denied) return sendJson(res, denied.status, { error: denied.error });
    // Answered like a missing request, so a Branch Admin cannot probe other branches' request ids.
    if (!isRequestInScope(request, await readScope(session))) return sendJson(res, 404, { error: "No such request." });
    // A decision is final: overwriting it would erase who decided and what they decided.
    if (request.status !== "pending") return sendJson(res, 409, { error: alreadyDecided(request) });

    const resolved = await storage.resolve(id, { status: input.status, resolvedBy: session.address, resolvedAt: new Date(now()).toISOString() });
    // Decided (or replaced by a newer request) between the read above and this write.
    if (!resolved) return sendJson(res, 409, { error: alreadyDecided(await storage.get(id)) });
    return sendJson(res, 200, resolved);
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
        sendJson(res, 200, { requests: (await storage.listPending()).filter((r) => isRequestInScope(r, scope)) });
      }
    } else if (req.method === "GET" && id === "mine" && !sub) {
      sendJson(res, 200, { request: await storage.latestFor(session.address) });
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
