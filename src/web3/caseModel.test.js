import { describe, expect, it } from "vitest";
import { buildCaseExport, groupByCase, integrityState, matchesQuery, summarize } from "./caseModel.js";
import { deriveCaseRef } from "./format.js";

const entry = (action, timestamp, index = 0) => ({ index, action, actor: "0xA", counterparty: null, timestamp, noteHash: null });
const record = (id, caseRef, custody, extra = {}) => ({
  id,
  caseRef,
  sha256: "ab".repeat(32),
  cid: `bafy${id}`,
  submitter: "0xSubmitter",
  custodian: "0xCustodian",
  submittedAt: custody[0]?.timestamp ?? 0,
  custodyCount: custody.length,
  custodyHead: "00".repeat(32),
  custody,
  ...extra,
});

describe("integrityState", () => {
  it("is unchecked until a re-check is recorded", () => {
    expect(integrityState(record(1, "c", [entry("Submitted", 1), entry("Accessed", 2)]))).toBe("unchecked");
  });

  it("follows the most recent re-check, not the worst one ever", () => {
    expect(integrityState(record(1, "c", [entry("Submitted", 1), entry("VerifiedMismatch", 2), entry("VerifiedMatch", 3)]))).toBe("matched");
    expect(integrityState(record(1, "c", [entry("Submitted", 1), entry("VerifiedMatch", 2), entry("VerifiedMismatch", 3)]))).toBe("mismatch");
  });

  it("is not changed by other later events", () => {
    expect(integrityState(record(1, "c", [entry("Submitted", 1), entry("VerifiedMismatch", 2), entry("Accessed", 3)]))).toBe("mismatch");
  });
});

describe("groupByCase", () => {
  const known = deriveCaseRef("CASE-2025-0042");
  const directory = { [known]: { caseNumber: "CASE-2025-0042", title: "Cyber Fraud Investigation" } };
  const records = [
    record(1, known, [entry("Submitted", 100)]),
    record(2, "0x" + "cd".repeat(32), [entry("Submitted", 300), entry("VerifiedMismatch", 400, 1)]),
    record(3, known, [entry("Submitted", 200), entry("Accessed", 250, 1)]),
  ];

  it("groups by case reference and orders by latest activity", () => {
    const groups = groupByCase(records);
    expect(groups.map((g) => g.evidence.map((e) => e.id))).toEqual([[2], [1, 3]]);
    expect(groups[0].lastActivity).toBe(400);
  });

  it("uses the directory for names and a short reference otherwise", () => {
    const groups = groupByCase(records, directory);
    expect(groups[1].caseNumber).toBe("CASE-2025-0042");
    expect(groups[1].title).toBe("Cyber Fraud Investigation");
    expect(groups[0].caseNumber).toBeNull();
    expect(groups[0].label).toMatch(/^Case 0x[0-9a-f]{6}…[0-9a-f]{4}$/);
  });

  it("counts mismatches per case", () => {
    expect(groupByCase(records).map((g) => g.mismatches)).toEqual([1, 0]);
  });
});

describe("summarize", () => {
  it("counts evidence, cases, mismatches and custody events", () => {
    const records = [
      record(1, "a", [entry("Submitted", 1)]),
      record(2, "a", [entry("Submitted", 2), entry("VerifiedMismatch", 3, 1)]),
      record(3, "b", [entry("Submitted", 4)]),
    ];
    expect(summarize(records)).toEqual({ evidence: 3, cases: 2, mismatches: 1, events: 4 });
  });
});

describe("matchesQuery", () => {
  const ref = deriveCaseRef("CASE-2025-0042");
  const group = groupByCase([record(7, ref, [entry("Submitted", 1)], { cid: "bafyfindme", sha256: "ee".repeat(32) })], { [ref]: { caseNumber: "CASE-2025-0042", title: "Cyber Fraud Investigation" } })[0];

  it.each([
    ["", true],
    ["  ", true],
    ["case-2025-0042", true],
    ["cyber fraud", true],
    ["BAFYFINDME", true],
    ["eeeeee", true],
    ["0xsubmitter", true],
    ["nothing like this", false],
  ])("query %j -> %s", (query, expected) => {
    expect(matchesQuery(group, query)).toBe(expected);
  });
});

describe("buildCaseExport", () => {
  const group = groupByCase([record(1, "0x" + "ab".repeat(32), [entry("Submitted", 1_800_000_000), entry("Accessed", 1_800_000_060, 1)])])[0];
  const config = { chainId: 11155111, address: "0x5FbDB2315678afecb367f032d93F642f64180aa3" };

  it("contains everything a reviewer needs to recheck the chain", () => {
    const out = buildCaseExport({ group, config, mode: "chain", generatedAt: new Date("2026-10-26T12:00:00Z") });
    expect(out.format).toBe("forensics-locker/case-record/v1");
    expect(out.generatedAt).toBe("2026-10-26T12:00:00.000Z");
    expect(out.source).toMatchObject({ mode: "chain", chainId: 11155111, contract: config.address });
    expect(out.custodyHashRule).toContain("keccak256(abi.encode(previousHead");
    expect(out.evidence[0].custody).toHaveLength(2);
    expect(out.evidence[0].custody[0]).toMatchObject({ action: "Submitted", timestamp: 1_800_000_000 });
    expect(out.evidence[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tells the reviewer how to verify independently", () => {
    expect(buildCaseExport({ group, config, mode: "chain" }).source.note).toContain("verify(), verifyCaseChain() and verifyCustodyChain()");
  });
});
