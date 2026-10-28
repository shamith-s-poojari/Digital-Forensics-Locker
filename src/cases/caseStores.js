// The two implementations of the case store the app talks to, behind one interface:
//
//   list()                                   -> Case[]
//   create({ caseNumber, title, description }, editor?) -> Case        (version 1)
//   addVersion(caseRef, { title, description }, editor?) -> Case       (appends; an unchanged edit adds nothing)
//   (editor: the acting address. The demo records it; the server ignores it and uses the signed-in session.)
//
//   Case    = { caseRef, caseNumber, createdBy, createdAt, versions: Version[] }   oldest version first
//   Version = { version, title, description, salt, digest, editedBy, editedAt }
//
// - httpCaseStore: the server store (server/caseStore.js), used with a real contract. Needs a wallet sign-in.
// - createDemoCaseStore: in memory, seeded with the fictional sample cases, used with the demo ledger.

import { deriveCaseRef } from "../web3/format.js";
import { computeCaseDigest, newSalt, normaliseText } from "./caseDigest.js";
import { SAMPLE_CASES } from "./sampleCases.js";

const HEADERS = { "X-Requested-With": "forensics-locker" };

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers: { ...HEADERS, ...init.headers } });
  } catch (err) {
    throw new Error("Could not reach the case store. Is the dev server running?", { cause: err });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || `Case store error (HTTP ${res.status}).`), { status: res.status });
  return body;
}

const postJson = (path, data) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

export const httpCaseStore = {
  kind: "server",
  list: async () => (await call("/api/cases")).cases ?? [],
  create: (fields) => postJson("/api/cases", fields),
  addVersion: (caseRef, fields) => postJson(`/api/cases/${caseRef}/versions`, fields),
};

/**
 * @param {object} [options]
 * @param {boolean} [options.seed] Start with the sample cases.
 */
export function createDemoCaseStore({ seed = true } = {}) {
  const cases = new Map(seed ? SAMPLE_CASES.map((c) => [c.caseRef, structuredClone(c)]) : []);
  const now = () => new Date().toISOString();

  function version(entry, number, { title, description }, editor) {
    const salt = newSalt();
    return { version: number, title, description, salt, digest: computeCaseDigest({ caseRef: entry.caseRef, caseNumber: entry.caseNumber, title, description, salt }), editedBy: editor ?? null, editedAt: now() };
  }
  const fields = (input) => {
    const title = normaliseText(input?.title);
    if (!title) throw new Error("A case title is required.");
    return { title, description: normaliseText(input?.description) };
  };

  return {
    kind: "demo",
    list: async () => [...cases.values()].map((c) => structuredClone(c)),
    create: async (input, editor) => {
      const caseNumber = normaliseText(input?.caseNumber).toUpperCase();
      if (!caseNumber) throw new Error("A case number is required.");
      const caseRef = deriveCaseRef(caseNumber);
      if (cases.has(caseRef)) throw new Error("This case already exists. Edit it instead.");
      const entry = { caseRef, caseNumber, createdBy: editor ?? null, createdAt: now(), versions: [] };
      entry.versions.push(version(entry, 1, fields(input), editor));
      cases.set(caseRef, entry);
      return structuredClone(entry);
    },
    addVersion: async (caseRef, input, editor) => {
      const entry = cases.get(caseRef);
      if (!entry) throw new Error("No such case.");
      const next = fields(input);
      const current = entry.versions.at(-1);
      if (current.title !== next.title || current.description !== next.description) entry.versions.push(version(entry, current.version + 1, next, editor));
      return structuredClone(entry);
    },
    /** Demo/test only: direct access, for simulating an edit made behind the store's back. */
    _cases: cases,
  };
}
