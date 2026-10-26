# Roadmap: from demo to a real evidence system

Status: **proposal for the owner to approve.** Companion to [`THREAT_MODEL.md`](THREAT_MODEL.md). Effort figures are rough ranges for one developer working with AI assistance, not commitments. Anything marked `DECISION:` needs an answer from the owner before the work that depends on it starts.

## 0. Where we are today

| Area | State |
| --- | --- |
| UI | Five pages, responsive, accessible basics, 257 tests, CI (lint, test, build). |
| Hashing | SHA-256 in the browser, whole file in memory, 10 MB cap. |
| Upload | Optional public IPFS pin through `/api/pin`, a proxy that only exists in the Vite dev/preview servers. No user authentication. |
| Identity | MetaMask shows an address. No signature, no sessions, no roles. |
| Data | Fictional, in `src/data/mockData.js`. Nothing persists. |
| Ledger | None. No contract, no log, no anchoring. |
| Honesty labels | Persistent DEMO banner; the word "verified" is not used as a conclusion anywhere. |

**Rule for the whole roadmap:** the DEMO banner and the "this cannot confirm authenticity" wording stay until the exit criteria of Phase 5 are met. Never reintroduce "verified" before Phase 4 exits.

## 1. The process cycle (used for every work item)

Run this loop for every task, in every phase. It is what keeps the system stable while it changes.

1. **Pick** one item from the current phase. One phase at a time; never start phase N+1 work before phase N exits.
2. **Spec** (half a page): goal, acceptance criteria, which threat IDs (T1..T9) it addresses, files/areas touched, what is explicitly out of scope.
3. **Decision check:** does it touch an open `DECISION:`? Resolve it first and record it in section 6 of this file. For a contested decision, run a council session (several independent viewpoints, peer review, one verdict) before deciding.
4. **Branch and test first:** write the failing tests (unit, contract or API) that express the acceptance criteria.
5. **Implement in small pull requests** (aim for under about 400 changed lines). Independent pieces can be built in parallel, but each owner touches disjoint files and one integrator owns shared files (`package.json`, `App.jsx`, schema migrations).
6. **Automated gate** (CI must be green): lint, tests, build, `npm audit`, secret scan, and for contracts: tests, static analysis, gas report.
7. **Human review of the diff.** Security-sensitive paths (auth, crypto, contracts, anything that handles keys) need an explicit reviewer sign-off; agents never self-approve these.
8. **Staging:** deploy, run the manual checklist for that item, confirm no regression in earlier phases' exit checks.
9. **Merge and release:** tag, update the changelog, tick the item here, and update the threat model if the item changed a threat's status.
10. **Phase close:** check every exit criterion; hold a short retrospective; only then open the next phase.

**Definition of done** (every item): acceptance criteria met by tests that fail without the change; CI green; reviewed; documented (README or `docs/`); threat model updated; no new `VITE_*` secret; staging checked.

**Who does what**

| Who | Owns |
| --- | --- |
| Owner (you) | Decisions, accounts and keys (Pinata, RPC, hosting, domain), approving each phase exit, finding the forensics and legal reviewers. |
| Claude + subagents | Specs, implementation, tests, refactors, docs, first-pass review. Works in small PRs against the loop above. |
| External | Smart-contract auditor, penetration tester, forensics practitioner, legal counsel. Book these early: they have lead times. |

## 2. Phases

### Phase 0: Decisions and foundations (about 1 week)

Goal: remove every blocker that would make later work get thrown away.

- [ ] **Rotate the Pinata key** (new key, `pinFileToIPFS` only, in `.env` as `PINATA_JWT`). Review Pinata's usage logs for the old key.
- [ ] Answer the open decisions in section 6 and complete the "Trust anchors" table in the threat model.
- [ ] Write the one-page **definition of "verified"** (what a check proves and does not prove).
- [ ] Create environments: local, staging, production, each with its own keys and its own chain/network.
- [ ] Push the repo to a remote; protect `main` (required CI, required review); enable secret scanning and dependency alerts.
- [ ] Start booking the external reviewers (contract audit, forensics/legal) so their lead time overlaps the build.

Exit: all section-6 decisions recorded; old key revoked; protected `main` with green CI; reviewers booked.

### Phase 1: Backend, identity and access control (2-3 weeks)

Goal: a server that knows who is calling. Addresses T1, T2, T5.

- [ ] API service (Node + TypeScript recommended for new server code) with health checks, structured logging, rate limiting, and security headers (CSP, HSTS).
- [ ] PostgreSQL with migrations. Tables: users, roles, cases, evidence, custody_events, sessions, audit_log.
- [ ] **Sign-In with Ethereum (EIP-4361):** server-issued nonce, signature verification, expiry, httpOnly session cookie. Replace "connect shows an address" with real login.
- [ ] Roles and an officer allowlist (for example: admin, officer, reviewer read-only). Every endpoint checks the role.
- [ ] Move `/api/pin` from the Vite middleware into this API behind authentication, with per-user rate limits and size limits. Delete the Vite middleware.
- [ ] Append-only `audit_log` of every login, upload and read.

Exit: unauthenticated calls to any data endpoint fail; a forged or replayed login signature is rejected (tested); the Vite proxy is gone; no secret reachable from the browser (tested by scanning the production bundle in CI).

### Phase 2: Real evidence pipeline (2-3 weeks)

Goal: evidence is hashed, protected and stored for real. Addresses T3, T4.

- [ ] **Streaming SHA-256 in a Web Worker** (chunked, with progress). Drop the 10 MB cap and the whole-file-in-memory read. Keep known-vector tests.
- [ ] **Encryption before storage** (AES-256-GCM, per-file random key, wrapped by a KMS-held master key per D4; store a key-version field). Never pin plaintext evidence. Encryption happens on the server before pinning, so the browser upload goes to the API over TLS.
- [ ] Chunked/resumable upload to the API; the API pins to IPFS (or the chosen store) and records the CID.
- [ ] Replace `mockData.js` with API data for cases, evidence and custody events. Keep the mock file only as test fixtures.
- [ ] Evidence record stores: file hash (of the original bytes), ciphertext hash, CID, size, MIME type, submitter, server timestamp.
- [ ] Download/decrypt path for authorized officers, logged in `audit_log`.

Exit: a 1 GB file hashes without freezing the tab; the pinned bytes are ciphertext (tested); an unauthorized user cannot decrypt; UI shows only real records.

### Phase 3: Tamper-evident ledger (3-4 weeks)

Goal: a record that cannot be silently edited. Addresses T3, T6, T7. Gated by the "is on-chain needed" decision.

- [ ] **Hash-chained custody log** in the database: each event stores the previous event's hash (`hash = H(prev_hash || canonical_event)`). Verification job recomputes the chain.
- [ ] **Anchor the head hash twice, on a schedule (per D5):** on a public chain AND with an RFC 3161 trusted timestamp for the same hash. Only hashes or Merkle roots leave the agency, never names or case IDs.
- [ ] Minimal anchor contract (Solidity, one function that emits the head hash; OpenZeppelin `AccessControl` so only the agency's anchoring key can call it), developed with Foundry or Hardhat and deployed to a testnet first. The per-event `EvidenceRegistry` is **out of scope** under D5. `DECISION:` choose the RFC 3161 authority once the jurisdiction (D2) is known.
- [ ] Event indexer: read the chain events into the database and reconcile; alert on mismatch.
- [ ] Custody transfer flow in the UI (submit, access, transfer, verify) calling the API; each step creates a ledger event.

Exit: editing or deleting a database row is detected by the verification job (tested); testnet anchor visible and reproducible by a third party using only public data and the CLI/docs; contract tests cover access control, replay and ordering.

### Phase 4: Verification and reporting (about 2 weeks)

Goal: a check that means something. Addresses T3, T7. Only now may the word "verified" return.

- [ ] Verify flow: recompute the file hash, look up the record, check the hash chain, check the anchor, and show each result separately (integrity, time, continuity, origin).
- [ ] **Signed verification receipt** (JSON plus PDF) that a reviewer can re-check offline; the receipt hash is itself logged.
- [ ] Server-generated custody report from real data (replace the sample-data jsPDF report); include the full chain and anchors.
- [ ] Independent verification path: a small open-source CLI/page that checks a file and receipt without the operator's UI.
- [ ] Wording review: every success/failure message states exactly what was and was not proven (the "non-claims" from the threat model).

Exit: a reviewer who does not trust the operator can verify a record end to end; tampering with the file, the record or the log each produces a distinct, correct failure.

### Phase 5: Hardening (3-4 weeks, partly waiting on externals)

Goal: someone other than us has tried to break it.

- [ ] Internal security review against every row of the threat model; update the status column.
- [ ] **Smart-contract audit** (external) and fix findings.
- [ ] **Penetration test** of API, auth and upload (external) and fix findings.
- [ ] Load and abuse testing (large uploads, rate limits, RPC outages, storage provider outage).
- [ ] Backups and restore drill for the database and key material; documented key-rotation and lost-key runbooks.
- [ ] Monitoring and alerting (errors, failed logins, ledger mismatches, anchor lag); incident-response runbook.
- [ ] Accessibility audit (WCAG 2.2 AA) and an end-to-end test suite (Playwright) covering the main flows.
- [ ] Dependency policy: pinned lockfile, automated updates, `npm audit` gate.

Exit: no open critical or high findings; restore drill passed; runbooks exist and were rehearsed.

### Phase 6: Pilot and launch (2-4 weeks)

- [ ] **Forensics practitioner and legal counsel review** of the process, the reports and the admissibility story; adjust the product to their findings. Align procedures with recognised guidance (for example ISO/IEC 27037 on evidence handling) where your jurisdiction expects it.
- [ ] Privacy review: retention, deletion and erasure obligations versus an immutable log (store only hashes on chain; keep personal data off chain and deletable).
- [ ] Pilot on staging with real users and non-sensitive data; collect usability findings.
- [ ] Production deployment (mainnet or chosen network), fresh keys, production monitoring on.
- [ ] Remove the DEMO banner and demo wording only now; publish the "what this system does and does not prove" page.

Exit: signed-off review from both external reviewers; pilot complete; go/no-go decision recorded.

### Phase 7: Operate

Recurring: key rotation, dependency updates, anchor/ledger reconciliation reports, access reviews, restore drills, annual re-review of the threat model, incident post-mortems.

## 3. Rough timeline

| Phase | Effort | Can overlap with |
| --- | --- | --- |
| 0 Decisions and foundations | ~1 week | Booking external reviewers |
| 1 Backend and identity | 2-3 weeks | Phase 2 design |
| 2 Evidence pipeline | 2-3 weeks | Phase 3 contract design |
| 3 Ledger | 3-4 weeks | |
| 4 Verification and reporting | ~2 weeks | |
| 5 Hardening | 3-4 weeks | Auditor lead time starts in Phase 0 |
| 6 Pilot and launch | 2-4 weeks | |
| **Total** | **roughly 4-6 months** | Phase 7 is ongoing |

## 4. Reuse from the current code

- Keep: UI pages and shared primitives (`useCopyToClipboard`, `usePagination`, `StatusBadge`, `Pagination`), the accessibility work, the test suite and CI, the honest-labelling approach, `hash.js` (replaced internally by the streaming worker, same API).
- Replace: `mockData.js` as the data source (becomes test fixtures), the wallet context's display-only login, `server/pinataProxy.js` (its guards move into the authenticated API), the sample-data PDF generator.
- Add: `server/` API, `contracts/`, `workers/hash.worker.js`, a CLI verifier, Playwright tests, deployment configuration.

## 5. Risks to watch

| Risk | Early warning | Response |
| --- | --- | --- |
| Scope creep into a full blockchain platform | Phase 3 grows past 4 weeks | Fall back to hash-chained log plus periodic anchoring; add a contract only if a requirement demands it. |
| Key loss makes evidence unreadable | Key model chosen without a recovery story | Decide recovery (escrow, multi-party) in Phase 0, test it in Phase 5. |
| Privacy law versus immutable log | Personal data in on-chain payloads | Hashes only on chain; personal data in deletable storage. |
| External reviewer lead times | Not booked by end of Phase 0 | Book now; build while waiting. |
| AI-written code merged unreviewed | PRs merged with no human diff review | Enforce step 7 of the loop on security-sensitive paths. |
| Cost surprises (gas, storage, RPC) | No budget in Phase 0 | Estimate per-evidence cost on testnet; set budgets and alerts. |

## 6. Decision log (fill in; update as decided)

| # | Decision | Options and trade-offs | Recommendation | Answer / date |
| --- | --- | --- | --- | --- |
| D1 | Portfolio demo or real product? | Demo: stop at honest labelling. Product: everything above is mandatory. | Product (this roadmap assumes it) | **Real product.** All phases mandatory. (2026-10-23) |
| D2 | Who are the users and which jurisdiction? | Police, corporate IR, legal, students; each has different legal rules. | Pick one primary user group first | **Law enforcement / police.** Jurisdiction not yet named: `OPEN:` owner to state the country/state (decides evidence-handling standards, data-residency and hosting rules, and which timestamp services courts accept). (2026-10-23) |
| D3 | Is the operator trusted? | Trusted: simpler (server holds keys). Untrusted: client-side keys, harder, key loss is permanent. | Start with a trusted operator plus independent anchoring; revisit | **Trusted operator + independent anchor.** The agency runs servers and holds keys; the log head is anchored externally so history cannot be silently rewritten. (2026-10-23) |
| D4 | Key model for encryption | A) server-side envelope encryption with a KMS. B) client-side with per-officer public keys. | A for speed; design B-compatible formats | **Server-side envelope encryption with a KMS** (per-file random key wrapped by an agency-controlled master key in a cloud KMS or HSM). Include a key-version field in the stored format so client-side keys could be added later. (2026-10-23) |
| D5 | Is on-chain anchoring needed? | Signed hash-chained log with a trusted timestamp may be enough; a public chain adds independent verifiability and cost. | Anchor the log head on an L2/testnet first; add a contract only if needed | **Both:** periodically anchor the hash-chained log's head on a public chain AND obtain an RFC 3161 timestamp for the same hash. No per-event on-chain registry. Only hashes leave the agency. (2026-10-23) |
| D6 | Which chain or timestamp service? | Public L2 (cheap, independent), Ethereum mainnet (costly), permissioned chain (private, operator-run), RFC 3161 TSA. | Testnet now; choose an L2 by Phase 3 | |
| D7 | Storage: public IPFS, private pinning, or object storage? | Public IPFS means a CID is a capability and content is permanent. | Never plaintext on public IPFS; encrypted bytes only | |
| D8 | Retention and deletion policy | Immutable log versus erasure rights. | Hashes on chain, personal data off chain | |
| D9 | Hosting and budget | Static frontend plus managed API/DB; cost per evidence item. | Managed services; budget set in Phase 0 | |
| D10 | Language for new server code | TypeScript recommended for the API, contracts tooling and shared types. | TypeScript | |

## 7. The first 10 days (concrete)

1. Rotate the Pinata key; confirm the proxy works with the new `PINATA_JWT`.
2. Push the repo, protect `main`, turn on secret scanning.
3. Answer D1-D5 (30-60 minutes each; use a council session for D3-D5 if you are unsure).
4. Complete the threat model's trust-anchor table from those answers.
5. Write the "definition of verified" page.
6. Book the contract auditor and the forensics/legal reviewer.
7. Open Phase 1 with specs for: API skeleton, database schema, SIWE login. Build them in the loop above.
