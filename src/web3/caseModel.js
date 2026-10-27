import { mockCases } from "../data/mockData";
import { deriveCaseRef, formatUtc, shorten } from "./format.js";

/**
 * Pure helpers that turn ledger records into what the dashboard shows. No React, no network.
 */

/**
 * TEMPORARY off-chain case directory. The chain only holds an opaque case reference, so titles and officers must
 * come from somewhere else; until the Phase 1 API exists, the sample cases stand in (matched by their derived reference).
 */
export const CASE_DIRECTORY = Object.fromEntries(
  mockCases.map((c) => [deriveCaseRef(c.id), { caseNumber: c.id, title: c.title, officer: c.officer, dateOpened: c.dateOpened }])
);

export const ACTION_META = Object.freeze({
  Submitted: { label: "Registered", tone: "info" },
  Accessed: { label: "Accessed", tone: "neutral" },
  Transferred: { label: "Custody transferred", tone: "warning" },
  VerifiedMatch: { label: "Hash re-checked: match", tone: "success" },
  VerifiedMismatch: { label: "Hash re-checked: MISMATCH", tone: "danger" },
  Reassigned: { label: "Custody reassigned by Chief", tone: "warning" },
});

export const INTEGRITY_META = Object.freeze({
  unchecked: { label: "Not re-checked", tone: "neutral" },
  matched: { label: "Hash matched", tone: "success" },
  mismatch: { label: "Hash MISMATCH", tone: "danger" },
});

/**
 * The outcome of the most recent hash re-check recorded for an evidence item.
 * "matched" means the file in hand hashed to the on-chain value at that time. It says nothing about whether the
 * evidence was genuine or intact BEFORE it was registered.
 *
 * @returns {"unchecked" | "matched" | "mismatch"}
 */
export function integrityState(record) {
  const last = [...record.custody].reverse().find((c) => c.action === "VerifiedMatch" || c.action === "VerifiedMismatch");
  if (!last) return "unchecked";
  return last.action === "VerifiedMismatch" ? "mismatch" : "matched";
}

export function lastActivity(record) {
  return record.custody.length ? record.custody[record.custody.length - 1].timestamp : record.submittedAt;
}

/** Case-store entries -> the { caseRef: { caseNumber, title } } directory groupByCase reads (current versions). */
export function directoryFromCases(cases) {
  return Object.fromEntries(cases.map((c) => [c.caseRef, { caseNumber: c.caseNumber, title: c.versions.at(-1)?.title ?? null }]));
}

/**
 * Groups evidence by case reference, newest activity first.
 * @param {object[]} records
 * @param {Record<string, { caseNumber: string, title: string, officer?: string }>} [directory]
 */
export function groupByCase(records, directory = CASE_DIRECTORY) {
  const groups = new Map();
  for (const record of records) {
    const info = directory[record.caseRef] ?? null;
    if (!groups.has(record.caseRef)) {
      groups.set(record.caseRef, {
        caseRef: record.caseRef,
        caseNumber: info?.caseNumber ?? null,
        title: info?.title ?? null,
        label: info?.caseNumber ?? `Case ${shorten(record.caseRef, 8, 4)}`,
        evidence: [],
        mismatches: 0,
        lastActivity: 0,
      });
    }
    const group = groups.get(record.caseRef);
    group.evidence.push(record);
    if (integrityState(record) === "mismatch") group.mismatches += 1;
    group.lastActivity = Math.max(group.lastActivity, lastActivity(record));
  }
  return [...groups.values()].sort((a, b) => b.lastActivity - a.lastActivity);
}

export function summarize(records) {
  return {
    evidence: records.length,
    cases: new Set(records.map((r) => r.caseRef)).size,
    mismatches: records.filter((r) => integrityState(r) === "mismatch").length,
    events: records.reduce((sum, r) => sum + r.custody.length, 0),
  };
}

/** Case-insensitive search across the things an investigator would paste in: case, hash, CID, address, id. */
export function matchesQuery(group, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [group.label, group.title, group.caseRef, ...group.evidence.flatMap((e) => [String(e.id), e.sha256, e.cid, e.submitter, e.custodian])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * A self-contained record of one case that a reviewer can check without this application: for each evidence item
 * the hash, CID and full custody trail, plus how to recompute the chain.
 */
export function buildCaseExport({ group, config, mode, caseEntry = null, generatedAt = new Date() }) {
  return {
    format: "forensics-locker/case-record/v1",
    generatedAt: generatedAt.toISOString(),
    source: {
      mode,
      chainId: config.chainId,
      contract: config.address,
      note:
        mode === "demo"
          ? "DEMO DATA: produced by the in-memory development ledger; nothing here is recorded on a blockchain."
          : "Read from the EvidenceLocker contract. Verify independently by calling verify(), verifyCaseChain() and verifyCustodyChain() on the contract.",
    },
    case: { reference: group.caseRef, caseNumber: group.caseNumber, title: group.title },
    caseChainRule:
      "h_0 = SHA256(caseId as 32 bytes); h_i = SHA256(h_{i-1} || sha256 || cid || submitter || registeredAt unix seconds as uint256), packed without padding, over the case's evidence in caseIndex order. Each h_i is that evidence item's link.",
    caseDetails: caseEntry
      ? {
          digestRule:
            'caseDigest = SHA256(UTF-8(JSON.stringify(["dfl-case-details/v1", caseRef (lowercase), caseNumber (uppercase), title, description, salt]))), strings NFC-normalised and trimmed. Each evidence item records the caseDigest it anchored.',
          versions: caseEntry.versions.map((v) => ({ version: v.version, title: v.title, description: v.description, salt: v.salt, editedBy: v.editedBy, editedAt: v.editedAt })),
        }
      : null,
    custodyHashRule:
      "entryHash = keccak256(abi.encode(previousHead, uint8 action, actor, counterparty, uint64 timestamp, bytes32 noteHash)); the first previousHead is 32 zero bytes; the last entryHash is custodyHead.",
    evidence: group.evidence.map((e) => ({
      id: e.id,
      sha256: e.sha256,
      cid: e.cid,
      submitter: e.submitter,
      custodian: e.custodian,
      registeredAt: formatUtc(e.submittedAt),
      registeredAtUnix: e.submittedAt,
      caseIndex: e.caseIndex,
      link: e.link,
      caseDigest: e.caseDigest,
      custodyHead: e.custodyHead,
      integrity: integrityState(e),
      custody: e.custody.map((c) => ({
        index: c.index,
        action: c.action,
        actor: c.actor,
        counterparty: c.counterparty,
        time: formatUtc(c.timestamp),
        timestamp: c.timestamp,
        noteHash: c.noteHash,
      })),
    })),
  };
}
