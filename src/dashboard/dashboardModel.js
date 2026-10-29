import { integrityState, lastActivity } from "../web3/caseModel.js";
import { sameAddress, shorten } from "../web3/format.js";

/**
 * Pure helpers behind the role dashboards (src/pages/RoleHome.jsx). No React, no network: they only reshape the
 * ledger records (see ethersLedger.js for their shape) into what each role needs to see first.
 */

/** Custody actions that move an item to someone else; the recipient is the entry's `counterparty`. */
const HANDOVERS = new Set(["Transferred", "Reassigned"]);

/** The case dashboard, opened on one evidence item. */
export const evidenceLink = (record) => `/cases?case=${record.caseRef}&evidence=${record.id}`;

/**
 * Every custody entry across the ledger, newest first.
 *
 * @param {object[]} records
 * @param {{ involving?: string | null, limit?: number }} [options]  involving: only entries this address acted in or received
 */
export function activityFeed(records, { involving = null, limit = 10 } = {}) {
  const entries = records.flatMap((record) =>
    record.custody.map((entry) => ({ ...entry, key: `${record.id}:${entry.index}`, evidenceId: record.id, caseRef: record.caseRef }))
  );
  const relevant = involving ? entries.filter((e) => sameAddress(e.actor, involving) || sameAddress(e.counterparty, involving)) : entries;
  return relevant.sort((a, b) => b.timestamp - a.timestamp || b.evidenceId - a.evidenceId || b.index - a.index).slice(0, limit);
}

/** Items whose current custodian is `account`, most recently active first. */
export function inCustodyOf(records, account) {
  return records.filter((r) => sameAddress(r.custodian, account)).sort((a, b) => lastActivity(b) - lastActivity(a));
}

/** Items `account` registered. */
export function submittedBy(records, account) {
  return records.filter((r) => sameAddress(r.submitter, account));
}

/** Handovers to `account` within the last `withinSeconds`, newest first. */
export function receivedRecently(records, account, { nowSeconds, withinSeconds = 7 * 24 * 3600 }) {
  return activityFeed(records, { involving: account, limit: Infinity }).filter(
    (e) => HANDOVERS.has(e.action) && sameAddress(e.counterparty, account) && nowSeconds - e.timestamp <= withinSeconds
  );
}

/** A case's human label from the case directory ({ caseRef: { caseNumber } }), or a shortened reference. */
export const caseLabel = (directory, caseRef) => directory[caseRef]?.caseNumber ?? `Case ${shorten(caseRef, 8, 4)}`;

/** Distinct cases among `records`. */
export const caseCount = (records) => new Set(records.map((r) => r.caseRef)).size;

/**
 * What an Auditor should look at first: items whose latest hash re-check failed, custody the Chief reassigned (an
 * override of the normal handover), and how many items have never been re-checked.
 */
export function exceptions(records) {
  return {
    mismatches: records.filter((r) => integrityState(r) === "mismatch"),
    reassignments: activityFeed(records, { limit: Infinity }).filter((e) => e.action === "Reassigned"),
    unchecked: records.filter((r) => integrityState(r) === "unchecked").length,
  };
}
