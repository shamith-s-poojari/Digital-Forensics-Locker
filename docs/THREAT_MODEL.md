# Threat model (template for the project owner)

Status: **draft template, not a decision record.** Items marked `DECISION:` are open. Nothing here is implemented in the current demo (see the README for what exists today). Fill this in before building any "real" feature.

## 1. Purpose and what "verified" means

Today nothing is verified. Before building, decide what a verification must prove. Candidate claims (pick, reword or drop):

- **Integrity:** these exact bytes are the bytes that were submitted. (`DECISION:` hash algorithm; what is hashed: raw file, container, or file plus metadata.)
- **Time:** the bytes existed no later than time T. (`DECISION:` whose clock is trusted.)
- **Origin:** a specific, accountable person or device submitted them. (`DECISION:` how identity is established.)
- **Continuity:** every custody transfer since submission is recorded, in order, with nothing removed.
- **Non-claims:** the system does **not** prove the evidence is authentic, lawfully obtained, or unaltered *before* submission. State this explicitly for users.

## 2. Assets

- Evidence file contents (may be sensitive, personal or privileged).
- Evidence metadata: case IDs, file names, submitter, timestamps.
- The custody log (its order, completeness and authorship).
- Credentials and keys: upload/storage API keys, signing keys, wallet keys, session secrets.
- Reputation of the process: a single successful forgery can taint every record.

## 3. Actors and adversaries

| Actor | Trusted for | Concern |
| --- | --- | --- |
| Evidence officer | Submitting and transferring evidence | Mistakes, coercion, stolen device or wallet. |
| Reviewer / court / opposing party | Reading and checking records | Needs a check that does not depend on trusting the operator. |
| System operator / admin | Running servers and holding keys | Insider tampering, key theft. |
| External attacker | Nothing | Steals keys, forges identities, replays messages, scrapes public data. |
| Malicious or careless insider | Has legitimate access | Substitutes or deletes evidence, backdates entries. |
| Third-party services (storage, RPC, CDN, fonts) | Availability only | Outages, logging, takedowns, content changes. |

`DECISION:` which of these are in scope, and is the operator trusted?

## 4. Trust anchors (to be decided)

Fill in one row per item. Do not assume the answers.

| Question | Answer |
| --- | --- |
| Who holds which keys (signing, storage, admin)? | Decided 2026-10-23 (roadmap D3/D4): the agency operates the system and holds the keys. File-encryption master key in an agency-controlled KMS/HSM; per-file keys wrapped by it; a separate anchoring key signs on-chain anchors. `DECISION:` admin/recovery procedure and who may use each key. |
| What is recorded on chain (if anything): hash only, hash plus metadata, nothing? | Decided (D5): only the periodic head hash of the custody log. No per-event registry, no names, case IDs or addresses of suspects. |
| What stays off chain (file bytes, names, case IDs)? | Decided (D5): everything except the head hash. File bytes are encrypted before storage; metadata lives in the agency database. |
| Which chain or timestamping service, and who pays for and operates it? | Decided in principle (D5): a public chain AND an RFC 3161 authority, both stamping the same head hash. `DECISION:` which chain and which authority (depends on the jurisdiction, roadmap D2/D6) and who pays. |
| Where do the file bytes live, and who can read them? | `DECISION:` |
| What is the root of trust for a reviewer checking a record years later? | `DECISION:` |

## 5. Threats

| # | Threat | Example | Present in demo? |
| --- | --- | --- | --- |
| T1 | **Key leakage** | A storage token in a `VITE_*` variable is inlined into the public bundle and copied by anyone. | Was possible in an earlier version; uploads are now disabled. Rotate any such key. |
| T2 | **Forged submitter identity** | A connected wallet address is shown as "submitted by" with no signature. Anyone can type or spoof an address. | Yes: display only. |
| T3 | **Hash substitution** | The stored hash is swapped, or the file is replaced and re-hashed, after submission. | Yes: nothing is stored or compared. |
| T4 | **Unencrypted evidence on public IPFS** | Pinned content is world-readable and effectively permanent; a CID is a capability. | Not applicable while uploads are disabled. |
| T5 | **Replay** | A valid signed message or request is resent to re-submit, re-assign or re-approve. | Not applicable (no signing yet). |
| T6 | **Metadata privacy on public chains** | Case IDs, addresses and timing are public and linkable forever, even if file bytes are private. | Not applicable (no chain). |
| T7 | **Log tampering or truncation** | Entries are edited, reordered, backdated or silently dropped. | Yes: no persistent log. |
| T8 | **Availability and loss** | Storage provider drops content, RPC goes down, keys are lost. | n/a |
| T9 | **Client-side compromise** | A malicious extension or XSS alters what the user sees or signs. | Possible; browser-only app. |

## 6. Mitigations to consider

Options, not commitments. Each needs an owner decision and a cost estimate.

- **Server-side upload proxy** with scoped, short-lived storage keys, rate limits and logging; the browser never holds a secret.
- **Sign-In with Ethereum (SIWE) plus an officer allowlist:** server-verified signature, nonce and expiry (addresses T2 and T5).
- **Append-only, hash-chained custody log:** each entry commits to the previous entry's hash; periodically anchor the head hash on chain or with a timestamp authority (T3, T7).
- **Client-side encryption before any public storage**, with key management defined (who can decrypt, key loss, key rotation) (T4, T6).
- **Trusted timestamping** (RFC 3161 or a public-chain anchor) for the "existed no later than" claim.
- **Store minimal data on chain:** a hash or Merkle root, never names or case IDs (T6).
- **Independent verification path:** a reviewer can recompute the hash and check the anchor without using the operator's UI.
- **Operational:** secret scanning in CI, key rotation runbook, dependency review, backups of the log.

## 7. Open questions

1. Is this a **portfolio demo** or a **real product**? If a demo, keep the honest labelling and stop at the disclaimers. If a product, everything above becomes mandatory.
2. Who are the users (police, corporate IR, legal, students) and what jurisdiction applies?
3. What retention, deletion and privacy obligations exist (for example, GDPR erasure versus an immutable log)?
4. What must a record contain to be useful to a court? A **forensics practitioner and legal counsel should review** this model, the process and the admissibility requirements before any real use.
5. Who is accountable when a key is lost or an officer account is compromised?
6. Is on-chain anchoring actually needed, or is a signed, timestamped, append-only log enough?

## 8. Review log

| Date | Reviewer | Notes |
| --- | --- | --- |
| | | |
