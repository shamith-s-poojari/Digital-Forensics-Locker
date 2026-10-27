// The two implementations of the access-request store, behind one interface:
//
//   mine(account?)                       -> Request | null   the caller's latest request
//   list()                               -> Request[]        every pending request, oldest first
//   submit({ role, reason }, account?)   -> Request          replaces the caller's pending request, if any
//   resolve(id, status, account?)        -> Request          status: "approved" | "rejected"
//   (account: the acting address. The demo uses it; the server ignores it and uses the signed-in session.)
//
//   Request = { id, address, role, reason, status, createdAt, resolvedBy, resolvedAt }
//             role: "admin" | "investigator" | "auditor"; status: "pending" | "approved" | "rejected"
//             (The Chief seat cannot be requested; it moves only by the contract's two-step transfer.)
//
// A request grants nothing. Access comes only from the role on the ledger, which the Chief grants in a transaction
// that the contract checks; "approved" is bookkeeping recorded after that transaction is confirmed.
//
// - httpAccessRequestStore: the server store (server/accessRequests.js), used with a real contract. Needs a sign-in.
// - createDemoAccessRequestStore: in memory, used with the demo ledger.

import { sameAddress } from "../web3/format.js";

export const REQUESTABLE_ROLES = Object.freeze(["admin", "investigator", "auditor"]);
export const MAX_REASON_LENGTH = 500;

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
  list: async () => (await call("/api/access-requests")).requests ?? [],
  submit: (fields) => postJson("/api/access-requests", fields),
  resolve: (id, status) => postJson(`/api/access-requests/${encodeURIComponent(id)}/resolve`, { status }),
};

/** Validates a request's fields (shared with the server). Returns { role, reason } or { error }. */
export function readRequestFields(input) {
  const role = input?.role;
  if (!REQUESTABLE_ROLES.includes(role)) return { error: "Choose Admin, Investigator or Auditor." };
  const reason = String(input?.reason ?? "").replace(/\s+/g, " ").trim();
  if (reason.length > MAX_REASON_LENGTH) return { error: `The reason is longer than ${MAX_REASON_LENGTH} characters.` };
  return { role, reason };
}

export function createDemoAccessRequestStore() {
  const requests = [];
  let counter = 0;
  const now = () => new Date().toISOString();
  const latestFor = (address) => requests.findLast((r) => sameAddress(r.address, address)) ?? null;

  return {
    kind: "demo",
    mine: async (account) => structuredClone(latestFor(account)),
    list: async () => structuredClone(requests.filter((r) => r.status === "pending")),
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
