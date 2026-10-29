// The two implementations of the access-request store, behind one interface:
//
//   mine(account?)                                 -> Request | null   the caller's latest request
//   list(scope?)                                   -> Request[]        pending requests the caller may decide, oldest first
//   submit({ role, branchId, reason }, account?)   -> Request          replaces the caller's pending request, if any
//   resolve(id, status, account?)                  -> Request          status: "approved" | "rejected"
//   (account, scope: the acting address and its branch scope. The demo uses them; the server ignores them and works
//   both out from the signed-in session and the contract.)
//
//   Request = { id, address, role, branchId, reason, status, createdAt, resolvedBy, resolvedAt }
//             role: "admin" | "investigator" | "auditor"; status: "pending" | "approved" | "rejected"
//             branchId: the branch (contract branch id) the requester asks to join
//             (The Chief seat cannot be requested; it moves only by the contract's two-step transfer.)
//
// Who sees which requests (`isRequestInScope`): the Chief sees every branch's; a Branch Admin sees only its own
// branch's requests for the working roles. Branch Admin requests go to the Chief alone, as on the contract.
//
// A request grants nothing. Access comes only from the role on the ledger, which the Chief grants in a transaction
// that the contract checks; "approved" is bookkeeping recorded after that transaction is confirmed.
//
// - httpAccessRequestStore: the server store (server/accessRequests.js), used with a real contract. Needs a sign-in.
// - createDemoAccessRequestStore: in memory, used with the demo ledger.

import { sameAddress } from "../web3/format.js";
import { inBranchScope } from "../web3/roles.js";

export const REQUESTABLE_ROLES = Object.freeze(["admin", "investigator", "auditor"]);
export const MAX_REASON_LENGTH = 500;
/** Branch ids are a uint64 on the contract; anything past 2^32 is a typo, not a branch. */
const MAX_BRANCH_ID = 2 ** 32;

/**
 * True if a caller with this branch scope (roles.js `branchScope`) may see and decide the request: the Chief any
 * request, a Branch Admin only working-role requests for its own branch.
 */
export function isRequestInScope(request, scope) {
  if (scope?.global) return true;
  return request.role !== "admin" && inBranchScope(scope, request.branchId);
}

const HEADERS = { "X-Requested-With": "forensics-locker" };

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers: { ...HEADERS, ...init.headers } });
  } catch (err) {
    throw new Error("Could not reach the access-request server. Is the dev server running?", { cause: err });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || `Access-request error (HTTP ${res.status}).`), { status: res.status });
  return body;
}

const postJson = (path, data) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

export const httpAccessRequestStore = {
  kind: "server",
  mine: async () => (await call("/api/access-requests/mine")).request ?? null,
  // Only the Chief and Branch Admins may list requests; the server refuses everyone else (403), who has nothing to see
  // here, and narrows a Branch Admin's list to its own branch.
  list: async () => {
    try {
      return (await call("/api/access-requests")).requests ?? [];
    } catch (err) {
      if (err?.status === 403) return [];
      throw err;
    }
  },
  submit: (fields) => postJson("/api/access-requests", fields),
  resolve: (id, status) => postJson(`/api/access-requests/${encodeURIComponent(id)}/resolve`, { status }),
};

/** Validates a request's fields (shared with the server). Returns { role, branchId, reason } or { error }. */
export function readRequestFields(input) {
  const role = input?.role;
  if (!REQUESTABLE_ROLES.includes(role)) return { error: "Choose Branch Admin, Investigator or Auditor." };
  const branchId = input?.branchId;
  if (!Number.isSafeInteger(branchId) || branchId < 1 || branchId > MAX_BRANCH_ID) return { error: "Choose your branch location." };
  const reason = String(input?.reason ?? "").replace(/\s+/g, " ").trim();
  if (reason.length > MAX_REASON_LENGTH) return { error: `The reason is longer than ${MAX_REASON_LENGTH} characters.` };
  return { role, branchId, reason };
}

export function createDemoAccessRequestStore() {
  const requests = [];
  let counter = 0;
  const now = () => new Date().toISOString();
  const latestFor = (address) => requests.findLast((r) => sameAddress(r.address, address)) ?? null;

  return {
    kind: "demo",
    mine: async (account) => structuredClone(latestFor(account)),
    list: async (scope) => structuredClone(requests.filter((r) => r.status === "pending" && (!scope || isRequestInScope(r, scope)))),
    submit: async (input, account) => {
      if (!account) throw new Error("Connect your wallet first.");
      const fields = readRequestFields(input);
      if (fields.error) throw new Error(fields.error);
      const previous = latestFor(account);
      if (previous?.status === "pending") requests.splice(requests.indexOf(previous), 1);
      const request = { id: `demo-${++counter}`, address: account, ...fields, status: "pending", createdAt: now(), resolvedBy: null, resolvedAt: null };
      requests.push(request);
      return structuredClone(request);
    },
    resolve: async (id, status, account) => {
      const request = requests.find((r) => r.id === id);
      if (!request) throw new Error("No such request.");
      if (status !== "approved" && status !== "rejected") throw new Error("Unknown decision.");
      Object.assign(request, { status, resolvedBy: account ?? null, resolvedAt: now() });
      return structuredClone(request);
    },
  };
}
