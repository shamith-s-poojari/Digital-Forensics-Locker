// In-memory case store for tests, with the same interface as httpCaseStore (src/cases/caseStores.js). Nothing here is
// imported by the application.

import { computeCaseDigest, newSalt, normaliseText } from "../cases/caseDigest.js";
import { deriveCaseRef } from "../web3/format.js";
import { FIXTURE_CASES } from "./fixtures/caseFixtures.js";

/**
 * @param {object} [options]
 * @param {boolean} [options.seed] Start with the fixture cases (whose digests the seeded in-memory ledger anchors).
 */
export function createMemoryCaseStore({ seed = true } = {}) {
  const cases = new Map(seed ? FIXTURE_CASES.map((c) => [c.caseRef, structuredClone(c)]) : []);
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
    kind: "memory",
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
    /** Direct access, for simulating an edit made behind the store's back. */
    _cases: cases,
  };
}
