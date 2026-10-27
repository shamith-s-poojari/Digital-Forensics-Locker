# Roadmap: to a production evidence system

Status: **proposal for the owner to approve, amended 2026-10-26 after the on-chain RBAC build (decisions D5, D6 and D7 changed; D11 and D12 added; see section 6).** Companion to [`THREAT_MODEL.md`](THREAT_MODEL.md). Effort figures are rough ranges for one developer working with AI assistance, not commitments. Anything marked `DECISION:` needs an answer from the owner before the work that depends on it starts.

## 0. Where we are today

| Area | State |
| --- | --- |
| UI | Case dashboard (cases, evidence with SHA-256 and CID, custody timeline), evidence upload, role management; responsive and accessible basics; web and contract test suites; CI (lint, tests, build, bundle secret scan, contract job). The development-only sample pages and sample data were removed on 2026-10-27. |
| Contract | `EvidenceLocker` (OpenZeppelin `AccessControlDefaultAdminRules`): roles Admin/Investigator/Auditor, append-only evidence and hash-chained custody, pause, admin recovery. Tested (including mutation-checked) on a local Hardhat chain. **Not deployed, not audited.** |
| Identity and roles | Roles are on chain and read by the UI; the contract enforces them on every write. Signed wallet login (EIP-4361 nonce, httpOnly session cookie, in-memory store on the Vite server) gates `/api/pin` and every evidence action; a lock, disconnect or account switch ends the session. No shared session store and no role check on the server yet (Phase 1). |
| Hashing | SHA-256 in the browser, whole file in memory, 10 MB cap. |
| Upload | The browser hashes the original file, encrypts it (AES-256-GCM, per-file random key), escrows the key with the dev key store (`/api/keys`, wrapped by an env-var master key), then pins only the **encrypted copy** to public IPFS through `/api/pin`. Both endpoints need a wallet sign-in and exist only in the Vite dev/preview servers. No role check on key release yet. |
| Data | The contract is the only ledger the app uses (development runs against a local Hardhat chain); an in-memory ledger exists for tests only. Case titles and descriptions come from the case store (`server/caseStore.js`, a JSON file on the dev server), anchored on chain by a salted digest; there is no database yet. |
| Honesty labels | Persistent PRE-RELEASE banner ("not audited and not yet evidence-grade"); the UI says what a hash match does and does not prove. |

**Rule for the whole roadmap:** the PRE-RELEASE banner and the "this cannot confirm authenticity" wording stay until the exit criteria of Phase 5 are met. Never reintroduce "verified" as a conclusion before Phase 4 exits. (The UI uses "hash matched" and "hash mismatch", which describe a comparison, not authenticity.)

**What changed on 2026-10-26.** The on-chain registry and role-based access control were built ahead of Phases 1 to 3, at the owner's request. The consequences are spelled out in the phases below and in decisions D5, D6, D7, D11 and D12. The most important one: **officer addresses and case activity are public on a public chain**, so production needs a permissioned or private network (D6); Sepolia is for development only.

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
- [ ] **Sign-In with Ethereum (EIP-4361):** server-issued nonce, signature verification, expiry, httpOnly session cookie. Replace "connect shows an address" with real login. **Partly done (2026-10-26):** nonce, verification, expiry, cookie, replay and forgery tests, and the client's lock, switch and disconnect handling exist (`server/siweAuth.js`, `src/context/WalletContext.jsx`). Still open: move them into the API with the `sessions` table, and read `rolesOf` after verifying.
- [ ] Roles and the officer allowlist. **Amended 2026-10-26 (D11):** the roles now live in the contract (Admin/Chief, Investigator, Auditor). The API therefore does not keep its own allowlist: after verifying a login signature it reads the signer's roles from the chain (`rolesOf`) and checks them on every endpoint. The database keeps profile data only (display name, agency ID). Spec 1.3 on the `phase1/01-api-scaffold` branch must be updated to match (its `users.role` column and admin API are replaced by contract reads).
- [ ] Move `/api/pin` from the Vite middleware into this API behind authentication, with per-user rate limits and size limits. Delete the Vite middleware.
- [ ] Append-only `audit_log` of every login, upload and read.

Exit: unauthenticated calls to any data endpoint fail; a forged or replayed login signature is rejected (tested); the Vite proxy is gone; no secret reachable from the browser (tested by scanning the production bundle in CI).

### Phase 2: Real evidence pipeline (2-3 weeks)

Goal: evidence is hashed, protected and stored for real. Addresses T3, T4.

- [ ] **Streaming SHA-256 in a Web Worker** (chunked, with progress). Drop the 10 MB cap and the whole-file-in-memory read. Keep known-vector tests.
- [ ] **Encryption before storage** (AES-256-GCM, per-file random key, wrapped by a KMS-held master key per D4; store a key-version field). Never pin plaintext evidence. **Partly done (2026-10-26, D4 amended):** encryption happens in the browser; the key is wrapped and stored by `server/keyStore.js` with a key-version field, and only ciphertext is pinned. Still open: move the master key into a KMS/HSM, release keys only to wallets whose on-chain role allows it, and keep the store in the API database.
- [ ] Chunked/resumable upload to the API; the API encrypts, pins to the chosen store and returns the CID.
- [ ] **The server checks the hash.** The SHA-256 the browser computes is only as trustworthy as that browser, and it is what the ledger will record. The API hashes the bytes it receives itself and refuses a submission whose claimed hash differs; only then does the browser register (hash, CID) on chain with the wallet.
- [x] Replace `mockData.js` with real data for cases, evidence and custody events. **Done 2026-10-27:** evidence and custody come from the contract, case details from the case store; the old sample data lives on only as test fixtures (`src/test/fixtures/`).
- [ ] Evidence record stores: file hash (of the original bytes), ciphertext hash, CID, size, MIME type, submitter, server timestamp.
- [ ] Download/decrypt path for authorized officers, logged in `audit_log`.

Exit: a 1 GB file hashes without freezing the tab; the pinned bytes are ciphertext (tested); an unauthorized user cannot decrypt; UI shows only real records.

### Phase 3: Tamper-evident ledger (3-4 weeks)

Goal: a record that cannot be silently edited. Addresses T3, T6, T7.

**Amended 2026-10-26 (D5, D6, D12).** The per-evidence on-chain registry now exists (`contracts/contracts/EvidenceLocker.sol`), so this phase is no longer "design an anchor contract" but "deploy it, harden it and make it independently checkable". Items already done are ticked.

- [x] **On-chain evidence registry with a hash-chained custody trail** per evidence item, written only by Investigators; the Chief manages roles, pauses, and can reassign stranded custody (logged). 47 contract tests, mutation-checked; the same scenarios also run against the in-memory test ledger.
- [x] **Custody flow in the UI:** register, log access, record a hash re-check (match or mismatch decided on chain), transfer, reassign; each is a ledger event with wallet-approval and confirmation feedback.
- [ ] **Database mirror and indexer:** read the contract's events into the database for fast queries and case metadata, and reconcile with the chain; alert on any mismatch. (Replaces the earlier "database hash-chained log": the chain is now the primary record.)
- [ ] **Independent anchoring (D5 retained, re-scoped):** on a permissioned network the operator could in principle rewrite history, so periodically anchor a digest of the registry state (for example a Merkle root over all custody heads) on a public chain AND obtain an RFC 3161 timestamp for the same digest. Only digests leave the agency. `DECISION:` the exact digest and schedule.
- [ ] **Deploy and publish:** deploy to a testnet, then to the production network (D6); record the deployment block; document how a third party verifies a record using only public data (`verify`, `verifyCustodyChain`, the exported JSON case record).
- [ ] **Chief key controls (D12):** the Chief is a multisig, the admin-transfer delay is set deliberately, and the pause and custody-reassignment runbook is written and rehearsed.
- [ ] **Salted case references:** replace the current unsalted `caseRef` hash with an HMAC computed by the API with a server secret (needs the Phase 1 API), so case numbers cannot be confirmed by guessing.
- [ ] `DECISION:` choose the RFC 3161 authority once the jurisdiction (D2) is known.

Exit: a third party can verify any record using only public chain data and the documented steps; editing a database row is detected by the reconciliation job (tested); the deployed contract is the audited one; the Chief key is a multisig; and the permissioned network's history is independently anchored.

### Phase 4: Verification and reporting (about 2 weeks)

Goal: a check that means something. Addresses T3, T7. Only now may the word "verified" return.

- [ ] Verify flow: recompute the file hash, look up the record, check the hash chain, check the anchor, and show each result separately (integrity, time, continuity, origin).
- [ ] **Signed verification receipt** (JSON plus PDF) that a reviewer can re-check offline; the receipt hash is itself logged.
- [ ] Server-generated custody report from real data; include the full chain and anchors. (The old sample-data jsPDF report was removed on 2026-10-27.)
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
- [ ] Remove the PRE-RELEASE banner and pre-release wording only now; publish the "what this system does and does not prove" page.

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

- Keep: the contract and its tests, the ledger adapter (`src/web3/`: the ethers implementation, the shared scenario suite, role and error handling; the in-memory test ledger in `src/test/`), the role context and route guards, the dashboard, upload and role-management pages, the shared UI primitives, the accessibility work, the test suites and CI (including the bundle secret scan), the honest-labelling approach, `hash.js` (replaced internally by the streaming worker, same API).
- Replace: `server/pinataProxy.js`, `server/keyStore.js` and `server/caseStore.js` (their guards move into the authenticated API, with a database), the unsalted `caseRef`. (`mockData.js`, the sample-data PDF generator and the two sample pages were removed on 2026-10-27.)
- Add: the `api/` service (see the `phase1/01-api-scaffold` branch), `workers/hash.worker.js`, an event indexer, a CLI verifier, Playwright tests, deployment configuration, a multisig Chief.

## 5. Risks to watch

| Risk | Early warning | Response |
| --- | --- | --- |
| Scope creep into a full blockchain platform | Phase 3 grows past 4 weeks | Fall back to hash-chained log plus periodic anchoring; add a contract only if a requirement demands it. |
| Key loss makes evidence unreadable | Key model chosen without a recovery story | Decide recovery (escrow, multi-party) in Phase 0, test it in Phase 5. |
| Privacy law versus immutable log | Personal data in on-chain payloads | Hashes only on chain; personal data in deletable storage. |
| External reviewer lead times | Not booked by end of Phase 0 | Book now; build while waiting. |
| AI-written code merged unreviewed | PRs merged with no human diff review | Enforce step 7 of the loop on security-sensitive paths. |
| Cost surprises (gas, storage, RPC) | No budget in Phase 0 | Estimate per-evidence cost on testnet; set budgets and alerts. |
| Officer identities and activity public on a public chain | A production deployment targeting a public network | Deploy on a permissioned or private network (D6); never put real operations on Sepolia or a public mainnet. |
| Chief key compromise or loss (one address can grant roles and pause) | The Chief is a single personal wallet | Multisig of hardware wallets (D12); the admin role moves only by a delayed two-step transfer; the Chief cannot write evidence on its own. |
| A bug in an immutable contract | No audit before deployment; any need to change it | External audit (Phase 5); the contract is not upgradeable by design, so a fix means a new deployment and a documented migration. Decide the migration plan before go-live. |
| The chain records a wrong hash (garbage in) | The browser is the only hasher | The server re-hashes what it receives before registration (Phase 2); the ledger proves bytes unchanged since registration, not that they were genuine before. |
| UI role guards mistaken for security | A reviewer assumes hidden buttons protect data | Document that the contract enforces roles; test that every write reverts for unauthorised wallets (done, 47 contract tests). |

## 6. Decision log (fill in; update as decided)

| # | Decision | Options and trade-offs | Recommendation | Answer / date |
| --- | --- | --- | --- | --- |
| D1 | Portfolio demo or real product? | Demo: stop at honest labelling. Product: everything above is mandatory. | Product (this roadmap assumes it) | **Real product.** All phases mandatory. (2026-10-23) |
| D2 | Who are the users and which jurisdiction? | Police, corporate IR, legal, students; each has different legal rules. | Pick one primary user group first | **Law enforcement / police.** Jurisdiction not yet named: `OPEN:` owner to state the country/state (decides evidence-handling standards, data-residency and hosting rules, and which timestamp services courts accept). (2026-10-23) |
| D3 | Is the operator trusted? | Trusted: simpler (server holds keys). Untrusted: client-side keys, harder, key loss is permanent. | Start with a trusted operator plus independent anchoring; revisit | **Trusted operator + independent anchor.** The agency runs servers and holds keys; the log head is anchored externally so history cannot be silently rewritten. (2026-10-23) |
| D4 | Key model for encryption | A) server-side envelope encryption with a KMS. B) client-side with per-officer public keys. | A for speed; design B-compatible formats | **Originally (2026-10-23):** server-side envelope encryption with a KMS (per-file random key wrapped by an agency-controlled master key in a cloud KMS or HSM), with a key-version field.<br>**AMENDED (2026-10-26, owner request):** the file is encrypted **in the browser** (plaintext never reaches any server), and the per-file key is escrowed with the server, which wraps it with the agency master key (envelope model and key-version field kept). The server briefly sees each per-file key. Today the master key is an environment variable; a KMS/HSM is still required before real use. |
| D5 | Is on-chain anchoring needed? | Signed hash-chained log with a trusted timestamp may be enough; a public chain adds independent verifiability and cost. | Anchor the log head on an L2/testnet first; add a contract only if needed | **Originally (2026-10-23):** anchor the hash-chained log's head on a public chain AND obtain an RFC 3161 timestamp; no per-event on-chain registry; only hashes leave the agency.<br>**AMENDED (2026-10-26, owner request):** a **per-evidence on-chain registry with role-based access control is now in scope** and built (`EvidenceLocker`). On chain: the SHA-256, the CID of the stored copy, an opaque `caseRef`, submitter and custodian addresses, timestamps, a hash-chained custody trail, and role grants. Never on chain: file bytes, file names, case numbers or titles, personal data. The earlier constraint "no addresses" no longer holds: **officer addresses and their activity are on the ledger** (see D6). Independent anchoring (public chain + RFC 3161) is retained, re-scoped to a digest of the registry state (Phase 3). |
| D6 | Which chain or timestamp service? | Public L2 (cheap, independent), Ethereum mainnet (costly), permissioned chain (private, operator-run), RFC 3161 TSA. | **Amended 2026-10-26:** Sepolia for development only; **production on a permissioned or private network**, because on a public chain officers' addresses, when they acted and which evidence they touched are public and permanently linkable. Keep independent anchoring (Phase 3). | `OPEN:` the production network and its operator; the RFC 3161 authority (depends on the jurisdiction, D2); who pays. Development: Sepolia, contract not yet deployed. |
| D7 | Storage: public IPFS, private pinning, or object storage? | Public IPFS means a CID is a capability and content is permanent. | Never plaintext on public IPFS; encrypted bytes only | **AMENDED 2026-10-26 (consequence of the registry; owner to confirm):** the ledger records the content identifier of an **encrypted** copy (the contract's `cid` field, up to 128 bytes), so plaintext evidence must never be pinned in production, and the CID must not be guessable. **Today's development build still pins plaintext to public IPFS** through the Pinata proxy, with a visible warning; that is acceptable for development only. `OPEN:` the production store (private pinning or agency object storage) and what locator the contract records; either way bytes are encrypted per D4 and the server checks the browser's claimed SHA-256 against the bytes it receives before registering (Phase 2). |
| D8 | Retention and deletion policy | Immutable log versus erasure rights. | Hashes on chain, personal data off chain | |
| D9 | Hosting and budget | Static frontend plus managed API/DB; cost per evidence item. | Managed services; budget set in Phase 0 | |
| D10 | Language for new server code | TypeScript recommended for the API, contracts tooling and shared types. | TypeScript | |
| D11 | Where do roles live? | Contract (on-chain `AccessControl`), the API database, or both. | Contract as the single source of truth; the API reads it. | **On chain** (2026-10-26, owner request): Admin/Chief, Investigator and Auditor are contract roles; the contract enforces them on every write, the UI reads `rolesOf`, and the Phase 1 API will read the chain after verifying a login signature (no separate allowlist). Consequence: granting or revoking a role is a transaction, and role membership is public. |
| D12 | Who holds the Chief (admin) key, and how is it protected? | One personal wallet; a multisig; hardware wallets behind a multisig. The contract moves the role only by a two-step transfer with a waiting period. | A multisig of hardware wallets; an admin-transfer delay of days; a rehearsed pause and recovery runbook. | `OPEN:` the deployer becomes the first Chief by default (`ADMIN_ADDRESS` can override) with a 3-day transfer delay (`ADMIN_DELAY_SECS`). Decide the multisig and signers before any non-test deployment. |

## 7. The first 10 days (concrete)

1. Rotate the Pinata key and rename it to `PINATA_JWT` in `.env` (no `VITE_` prefix); confirm the proxy works with the new key. (A `VITE_`-prefixed secret leaked into the bundle once already; `npm run check:bundle` now guards it.)
2. Push the repo, protect `main`, turn on secret scanning.
3. Decisions: D1 to D5 were answered on 2026-10-23, and D5, D6 and D7 were amended and D11 and D12 added on 2026-10-26. Still open: the production network (D6), the production store (D7), retention (D8), hosting and budget (D9) and the Chief key (D12). Use a council session for the contested ones.
4. Complete the threat model's trust-anchor table from those answers.
5. Write the "definition of verified" page.
6. Book the contract auditor and the forensics/legal reviewer.
7. Deploy `EvidenceLocker` to Sepolia with a **throwaway** key, set `VITE_LOCKER_ADDRESS`, and walk the three roles through the app end to end (this has not been done yet; today it is tested only on a local Hardhat chain and the in-memory test ledger).
8. Open Phase 1 with specs for: API skeleton, database schema, SIWE login. First update spec 1.3 so the API reads roles from the contract (D11) instead of keeping its own allowlist. Build them in the loop above.
