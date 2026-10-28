import { describe, expect, it } from "vitest";
import { computeCaseDigest } from "../cases/caseDigest.js";
import { deriveCaseRef } from "../web3/format.js";
import { checkCaseAnchors } from "./verifyCaseDetails.js";

const caseRef = deriveCaseRef("CASE-1");
function version(number, title, salt) {
  const fields = { caseRef, caseNumber: "CASE-1", title, description: "", salt };
  return { version: number, title, description: "", salt, digest: computeCaseDigest(fields) };
}
const V1 = version(1, "First title", "11".repeat(32));
const V2 = version(2, "Second title", "22".repeat(32));
const entryWith = (...versions) => ({ caseRef, caseNumber: "CASE-1", versions: structuredClone(versions) });
const record = (id, caseDigest) => ({ id, caseDigest });

describe("checkCaseAnchors", () => {
  it("is empty when the case has no records", () => {
    expect(checkCaseAnchors(entryWith(V1), []).status).toBe("empty");
  });

  it("reports no-details when the store has no entry, listing every record", () => {
    const check = checkCaseAnchors(null, [record(1, V1.digest), record(2)]);
    expect(check.status).toBe("no-details");
    expect(check.orphans).toEqual([
      { id: 1, caseDigest: V1.digest },
      { id: 2, caseDigest: null },
    ]);
  });

  it("verifies when every anchor matches and the current version is anchored", () => {
    const check = checkCaseAnchors(entryWith(V1, V2), [record(3, V2.digest), record(1, V1.digest), record(2, V1.digest.toUpperCase())]);
    expect(check.status).toBe("verified");
    expect(check.current).toEqual({ version: 2, anchored: true });
    expect(check.versions.map((v) => v.anchoredBy)).toEqual([[1, 2], [3]]); // in record order, case-insensitive digests
    expect(check.orphans).toEqual([]);
  });

  it("is pending when the case was edited after its last record", () => {
    const check = checkCaseAnchors(entryWith(V1, V2), [record(1, V1.digest)]);
    expect(check.status).toBe("pending");
    expect(check.current).toEqual({ version: 2, anchored: false });
  });

  it("detects an anchored version whose stored text was edited", () => {
    const entry = entryWith(V1, V2);
    entry.versions[0].title = "Rewritten quietly"; // its stored digest is left as it was
    const check = checkCaseAnchors(entry, [record(1, V1.digest), record(2, V2.digest)]);
    expect(check.status).toBe("tampered");
    expect(check.orphans).toEqual([{ id: 1, caseDigest: V1.digest }]);
    expect(check.versions[0].storedDigestMatches).toBe(false); // the stored digest field is not trusted
  });

  it("detects a removed version", () => {
    const check = checkCaseAnchors(entryWith(V2), [record(1, V1.digest), record(2, V2.digest)]);
    expect(check.status).toBe("tampered");
    expect(check.orphans.map((o) => o.id)).toEqual([1]);
  });

  it("does not trust a stored digest that was rewritten to match an edit", () => {
    const entry = entryWith(V1);
    entry.versions[0].title = "Rewritten";
    entry.versions[0].digest = "ff".repeat(32);
    expect(checkCaseAnchors(entry, [record(1, "ff".repeat(32))]).status).toBe("tampered");
  });

  it("treats a malformed salt as reproducing nothing", () => {
    const entry = entryWith(V1);
    entry.versions[0].salt = "not-a-salt";
    const check = checkCaseAnchors(entry, [record(1, V1.digest)]);
    expect(check.status).toBe("tampered");
    expect(check.versions[0]).toMatchObject({ digest: null, storedDigestMatches: false });
  });

  it("treats a record with no anchored digest as an orphan", () => {
    expect(checkCaseAnchors(entryWith(V1), [record(1, V1.digest), record(2, "")]).orphans).toEqual([{ id: 2, caseDigest: null }]);
  });
});
