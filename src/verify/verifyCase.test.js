import { describe, expect, it } from "vitest";
import { caseGenesis, computeLink } from "../web3/caseChain.js";
import { createDemoStore } from "../web3/demoLedger.js";
import { deriveCaseRef } from "../web3/format.js";
import { walkCaseChain } from "./verifyCase.js";

const CASE = deriveCaseRef("CASE-WALK-1");
const OTHER = deriveCaseRef("CASE-WALK-2");
const OFFICER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

/** Builds a correctly linked case of `n` records, the way the contract would. */
function buildCase(n, caseRef = CASE, firstId = 1) {
  const records = [];
  let previous = caseGenesis(caseRef);
  for (let i = 0; i < n; i += 1) {
    const r = { id: firstId + i, caseRef, caseIndex: i, sha256: String(i + 1).repeat(64).slice(0, 64), cid: CID, submitter: OFFICER, submittedAt: 1_800_000_000 + i * 60 };
    r.link = computeLink(previous, { sha256: r.sha256, cid: r.cid, officer: r.submitter, timestamp: r.submittedAt });
    previous = r.link;
    records.push(r);
  }
  return records;
}

describe("walkCaseChain", () => {
  it("passes a correctly linked case, checking every record", () => {
    const result = walkCaseChain(CASE, buildCase(4));
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(4);
    expect(result.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("passes an empty case", () => {
    expect(walkCaseChain(CASE, [])).toMatchObject({ ok: true, total: 0, checked: 0 });
  });

  it("sorts by position, so the order records arrive in does not matter", () => {
    const records = buildCase(3);
    expect(walkCaseChain(CASE, [records[2], records[0], records[1]]).ok).toBe(true);
  });

  for (const [field, change] of [
    ["sha256", (r) => (r.sha256 = "f".repeat(64))],
    ["cid", (r) => (r.cid = `${CID.slice(0, -1)}x`)],
    ["submitter", (r) => (r.submitter = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")],
    ["submittedAt", (r) => (r.submittedAt -= 86_400)], // backdated by a day
  ]) {
    it(`stops at the first record whose ${field} was altered, and checks nothing after it`, () => {
      const records = buildCase(4);
      change(records[1]);
      const result = walkCaseChain(CASE, records);
      expect(result.ok).toBe(false);
      expect(result.firstBad).toMatchObject({ index: 1, id: 2, status: "link-mismatch" });
      expect(result.checked).toBe(2);
      expect(result.steps.map((s) => s.status)).toEqual(["ok", "link-mismatch", "not-checked", "not-checked"]);
    });
  }

  it("detects a replaced link value", () => {
    const records = buildCase(3);
    records[2].link = "0".repeat(64);
    expect(walkCaseChain(CASE, records).firstBad).toMatchObject({ index: 2, status: "link-mismatch" });
  });

  it("detects a removed record (a gap in the positions)", () => {
    const records = buildCase(4);
    records.splice(1, 1);
    expect(walkCaseChain(CASE, records).firstBad).toMatchObject({ index: 1, id: 3, status: "out-of-order" });
  });

  it("detects a record moved in from another case", () => {
    const records = buildCase(2);
    const foreign = buildCase(3, OTHER, 10)[2];
    foreign.caseIndex = 2;
    expect(walkCaseChain(CASE, [...records, foreign]).firstBad).toMatchObject({ index: 2, id: 12, status: "wrong-case" });
  });

  it("detects a whole case relabelled as another case (the genesis value binds the chain to its case)", () => {
    const relabelled = buildCase(2).map((r) => ({ ...r, caseRef: OTHER }));
    expect(walkCaseChain(OTHER, relabelled).firstBad).toMatchObject({ index: 0, status: "link-mismatch" });
  });

  it("agrees with the demo ledger's seeded cases", () => {
    const store = createDemoStore();
    const caseRefs = [...new Set(store.evidence.map((e) => e.caseRef))];
    for (const caseRef of caseRefs) {
      expect(walkCaseChain(caseRef, store.evidence.filter((e) => e.caseRef === caseRef)).ok).toBe(true);
    }
  });
});
