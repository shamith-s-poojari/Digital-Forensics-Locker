// Checks a case's off-chain details against the digests its evidence records anchored on chain.
//
// Every version's digest is RECOMPUTED from its fields and salt (the stored `digest` field is not trusted), then each
// record's anchored digest is matched to a version:
//
//   verified    every anchor matches a version, and the current version is anchored by at least one record
//   pending     every anchor matches, but the current version was edited after the last record and is not anchored
//               yet (it will be, by the next record registered in the case)
//   tampered    at least one record anchored a digest that no version reproduces: the stored history was edited or
//               a version was removed after it was anchored
//   no-details  the case has records but the store has no entry for it
//   empty       no records to check against

import { computeCaseDigest } from "../cases/caseDigest.js";

/**
 * @param {{ caseRef: string, caseNumber: string, versions: Array<{ version: number, title: string, description: string, salt: string }> } | null} entry
 * @param {Array<{ id: number, caseDigest?: string }>} records  The case's evidence records.
 */
export function checkCaseAnchors(entry, records) {
  if (!records.length) return { status: "empty", versions: [], orphans: [], current: null };
  if (!entry) return { status: "no-details", versions: [], orphans: records.map((r) => ({ id: r.id, caseDigest: r.caseDigest ?? null })), current: null };

  const versions = entry.versions.map((v) => {
    let digest = null;
    try {
      digest = computeCaseDigest({ caseRef: entry.caseRef, caseNumber: entry.caseNumber, title: v.title, description: v.description, salt: v.salt });
    } catch {
      /* a malformed salt reproduces nothing */
    }
    return { version: v.version, digest, storedDigestMatches: digest !== null && digest === v.digest, anchoredBy: [] };
  });

  const byDigest = new Map(versions.filter((v) => v.digest).map((v) => [v.digest, v]));
  const orphans = [];
  for (const r of [...records].sort((a, b) => a.id - b.id)) {
    const anchored = String(r.caseDigest ?? "").toLowerCase();
    const match = byDigest.get(anchored);
    if (match) match.anchoredBy.push(r.id);
    else orphans.push({ id: r.id, caseDigest: anchored || null });
  }

  const latest = versions[versions.length - 1];
  const current = latest ? { version: latest.version, anchored: latest.anchoredBy.length > 0 } : null;
  const status = orphans.length ? "tampered" : current?.anchored ? "verified" : "pending";
  return { status, versions, orphans, current };
}
