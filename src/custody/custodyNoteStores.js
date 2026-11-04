// The two implementations of the custody note store the app talks to, behind one interface:
//
//   list(evidenceId)                            -> Note[]   oldest first
//   add({ evidenceId, note, branchId }, author?) -> Note
//   (author: the acting address. The demo records it; the server ignores it and uses the signed-in session.)
//
//   Note = { noteHash, evidenceId, branchId, note, salt, author, createdAt }
//
// - httpCustodyNoteStore: the server store (server/custodyNotes.js), used with a real contract. Needs a wallet sign-in.
// - createDemoCustodyNoteStore: in memory, used with the demo ledger.

import { newSalt, normaliseText } from "../cases/caseDigest.js";
import { computeNoteHash } from "./custodyNote.js";

const HEADERS = { "X-Requested-With": "forensics-locker" };

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers: { ...HEADERS, ...init.headers } });
  } catch (err) {
    throw new Error("Could not reach the custody note store.", { cause: err });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || `Custody note store error (HTTP ${res.status}).`), { status: res.status });
  return body;
}

export const httpCustodyNoteStore = {
  kind: "server",
  list: async (evidenceId) => (await call(`/api/custody-notes?evidence=${encodeURIComponent(evidenceId)}`)).notes ?? [],
  add: (fields) => call("/api/custody-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) }),
};

export function createDemoCustodyNoteStore() {
  const notes = [];
  return {
    kind: "demo",
    list: async (evidenceId) => notes.filter((n) => n.evidenceId === evidenceId).map((n) => structuredClone(n)),
    add: async ({ evidenceId, note, branchId }, author) => {
      const text = normaliseText(note);
      if (!text) throw new Error("A note cannot be empty.");
      const salt = newSalt();
      const entry = { noteHash: computeNoteHash({ evidenceId, author, note: text, salt }), evidenceId, branchId: branchId ?? null, note: text, salt, author, createdAt: new Date().toISOString() };
      notes.push(entry);
      return structuredClone(entry);
    },
  };
}
