// Walks a case chain independently of the contract: take the case's records in order, recompute each link from the
// record's own fields and the previous link, and stop at the first mismatch.
//
//   h_0 = SHA256(caseId),  h_i = SHA256(h_{i-1} || e_i || CID_i || W_i || T_i)   (src/web3/caseChain.js)
//
// Works on any list of records with the ledger's Evidence shape (from the chain, or from an exported case record),
// so a reviewer does not have to trust this application's reading of the contract.

import { caseGenesis, computeLink } from "../web3/caseChain.js";

/**
 * @typedef {"ok" | "link-mismatch" | "wrong-case" | "out-of-order" | "unreadable"} StepStatus
 * @typedef {{ id: number, caseIndex: number, status: StepStatus | "not-checked", expected: string | null, stored: string }} Step
 * @typedef {{
 *   ok: boolean,
 *   total: number,
 *   checked: number,
 *   firstBad: { index: number, id: number, status: StepStatus, message: string } | null,
 *   steps: Step[],
 * }} CaseChainResult
 */

const MESSAGES = {
  "link-mismatch": "its stored link does not match the link recomputed from its fields and the previous link",
  "wrong-case": "it belongs to another case",
  "out-of-order": "its position in the case is not the next one, so a record is missing or out of order",
  unreadable: "its fields could not be read to recompute the link",
};

/**
 * @param {string} caseRef 0x-prefixed 32-byte case id.
 * @param {Array<{ id: number, caseRef: string, caseIndex: number, sha256: string, cid: string, submitter: string, submittedAt: number, link: string }>} records
 *        The case's records, in any order (they are sorted by caseIndex; duplicates or gaps are reported).
 * @returns {CaseChainResult}
 */
export function walkCaseChain(caseRef, records) {
  const ordered = [...records].sort((a, b) => a.caseIndex - b.caseIndex || a.id - b.id);
  const steps = ordered.map((r) => ({ id: r.id, caseIndex: r.caseIndex, status: "not-checked", expected: null, stored: r.link }));

  let previous;
  try {
    previous = caseGenesis(caseRef);
  } catch {
    return { ok: false, total: steps.length, checked: 0, firstBad: { index: 0, id: ordered[0]?.id ?? 0, status: "unreadable", message: "the case reference is not a valid 32-byte value" }, steps };
  }

  for (let i = 0; i < ordered.length; i += 1) {
    const r = ordered[i];
    const step = steps[i];
    let status = "ok";
    if (String(r.caseRef).toLowerCase() !== String(caseRef).toLowerCase()) status = "wrong-case";
    else if (r.caseIndex !== i) status = "out-of-order";
    else {
      try {
        step.expected = computeLink(previous, { sha256: r.sha256, cid: r.cid, officer: r.submitter, timestamp: r.submittedAt });
        if (step.expected !== String(r.link).toLowerCase()) status = "link-mismatch";
      } catch {
        status = "unreadable";
      }
    }
    step.status = status;
    if (status !== "ok") {
      return { ok: false, total: steps.length, checked: i + 1, firstBad: { index: i, id: r.id, status, message: MESSAGES[status] }, steps };
    }
    previous = step.expected;
  }
  return { ok: true, total: steps.length, checked: steps.length, firstBad: null, steps };
}
