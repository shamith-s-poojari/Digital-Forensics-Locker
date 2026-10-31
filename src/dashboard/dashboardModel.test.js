import { describe, expect, it } from "vitest";
import {
  activityFeed,
  branchBreakdown,
  branchOfMember,
  caseCount,
  caseLabel,
  evidenceLink,
  exceptions,
  inCustodyOf,
  membersInBranch,
  receivedRecently,
  submittedBy,
} from "./dashboardModel.js";

const ANA = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const BEN = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
const CHIEF = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const CASE_A = `0x${"a".repeat(64)}`;
const CASE_B = `0x${"b".repeat(64)}`;
const DAY = 24 * 3600;
const NOW = 100 * DAY;

const entry = (index, action, actor, timestamp, counterparty = null) => ({ index, action, actor, counterparty, timestamp, noteHash: null });

// #1 Ana registers, hands to Ben yesterday. #2 Ben registers, re-check fails. #3 Ana registers; the Chief reassigns it
// to Ben 10 days ago. #4 Ana registers in another case and keeps it.
const records = [
  { id: 1, caseRef: CASE_A, submitter: ANA, custodian: BEN, submittedAt: NOW - 5 * DAY, custody: [entry(0, "Submitted", ANA, NOW - 5 * DAY), entry(1, "Transferred", ANA, NOW - DAY, BEN)] },
  { id: 2, caseRef: CASE_A, submitter: BEN, custodian: BEN, submittedAt: NOW - 4 * DAY, custody: [entry(0, "Submitted", BEN, NOW - 4 * DAY), entry(1, "VerifiedMismatch", BEN, NOW - 3 * DAY)] },
  { id: 3, caseRef: CASE_A, submitter: ANA, custodian: BEN, submittedAt: NOW - 20 * DAY, custody: [entry(0, "Submitted", ANA, NOW - 20 * DAY), entry(1, "Reassigned", CHIEF, NOW - 10 * DAY, BEN)] },
  { id: 4, caseRef: CASE_B, submitter: ANA, custodian: ANA, submittedAt: NOW - 2 * DAY, custody: [entry(0, "Submitted", ANA, NOW - 2 * DAY), entry(1, "VerifiedMatch", ANA, NOW - 2 * DAY + 60)] },
];

describe("dashboardModel", () => {
  it("lists custody activity newest first, optionally only what an address took part in", () => {
    const all = activityFeed(records, { limit: 3 });
    expect(all.map((e) => e.key)).toEqual(["1:1", "4:1", "4:0"]);
    expect(all[0]).toMatchObject({ evidenceId: 1, caseRef: CASE_A, action: "Transferred" });

    const chief = activityFeed(records, { involving: CHIEF.toLowerCase() });
    expect(chief.map((e) => e.key)).toEqual(["3:1"]);
    // Receiving counts as taking part.
    expect(activityFeed(records, { involving: BEN, limit: Infinity }).map((e) => e.key)).toContain("3:1");
  });

  it("finds what an address holds and what it registered", () => {
    expect(inCustodyOf(records, BEN).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(inCustodyOf(records, ANA).map((r) => r.id)).toEqual([4]);
    expect(submittedBy(records, ANA).map((r) => r.id)).toEqual([1, 3, 4]);
  });

  it("finds handovers to an address within the window, not ones it gave away", () => {
    expect(receivedRecently(records, BEN, { nowSeconds: NOW }).map((e) => e.key)).toEqual(["1:1"]);
    expect(receivedRecently(records, BEN, { nowSeconds: NOW, withinSeconds: 30 * DAY }).map((e) => e.key)).toEqual(["1:1", "3:1"]);
    expect(receivedRecently(records, ANA, { nowSeconds: NOW })).toEqual([]);
  });

  it("collects the exceptions an Auditor reviews first", () => {
    const found = exceptions(records);
    expect(found.mismatches.map((r) => r.id)).toEqual([2]);
    expect(found.reassignments.map((e) => e.key)).toEqual(["3:1"]);
    expect(found.unchecked).toBe(2); // #1 and #3 were never re-checked
  });

  it("places members in their branch and narrows the role lists to one branch", () => {
    const ADMIN = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
    const members = { chief: CHIEF, admins: [ADMIN], investigators: [ANA, BEN], auditors: [], branchOf: { [ADMIN]: 1, [ANA]: 1, [BEN]: 2 } };
    expect(branchOfMember(members, ANA.toLowerCase())).toBe(1);
    expect(branchOfMember(members, CHIEF)).toBeNull();

    const north = membersInBranch(members, 2);
    expect(north).toMatchObject({ chief: CHIEF, admins: [], investigators: [BEN], auditors: [] });

    const branched = records.map((r) => ({ ...r, branchId: r.caseRef === CASE_A ? 1 : 2 }));
    expect(branchBreakdown([{ id: 1, name: "Central" }, { id: 2, name: "North" }], members, branched)).toEqual([
      { id: 1, name: "Central", admins: 1, investigators: 1, auditors: 0, evidence: 3, cases: 1, mismatches: 1 },
      { id: 2, name: "North", admins: 0, investigators: 1, auditors: 0, evidence: 1, cases: 1, mismatches: 0 },
    ]);
  });

  it("counts cases, labels them and links to one item", () => {
    expect(caseCount(records)).toBe(2);
    expect(caseCount([])).toBe(0);
    expect(caseLabel({ [CASE_A]: { caseNumber: "CASE-1" } }, CASE_A)).toBe("CASE-1");
    expect(caseLabel({}, CASE_B)).toMatch(/^Case 0xbbbbbb/);
    expect(evidenceLink(records[1])).toBe(`/cases?case=${CASE_A}&evidence=2`);
  });
});
