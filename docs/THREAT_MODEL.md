# Threat model

Status: **working draft, updated 2026-10-26 for the on-chain role-based design.** It is not a decision record and has **not been reviewed by a forensics practitioner, legal counsel or a security auditor**. Items marked `DECISION:` or `OPEN:` are still open. The "Status today" column in section 5 says what the code does now; the README lists what exists. Decisions are tracked in [`ROADMAP.md`](ROADMAP.md) (section 6).

**What changed on 2026-10-26:** the system now has a Solidity contract (`contracts/contracts/EvidenceLocker.sol`) that holds the evidence register, the custody trail and the roles (Admin/Chief, Investigator, Auditor). It is tested but **not deployed and not audited**. The biggest new risk is that officer addresses and activity are **public on a public chain** (T6).

## 1. Purpose and what "verified" means

Today the ledger can tell you whether a file's SHA-256 equals the hash registered on chain, and whether an evidence item's custody trail still recomputes to its stored head. It does **not** by itself make any of the claims below true. Decide what a verification must prove before using the word "verified". Candidate claims (pick, reword or drop):

- **Integrity:** these exact bytes are the bytes that were registered. (Implemented as SHA-256 of the raw file, compared on chain with `verify`. `DECISION:` whether to hash a container or file plus metadata instead.)
- **Time:** the bytes existed no later than time T. (Today: the block timestamp of the registering transaction. `DECISION:` whose clock is trusted on a permissioned network; independent timestamping is planned, roadmap Phase 3.)
- **Origin:** a specific, accountable person or device submitted them. (Today: the wallet address that signed, which holds the Investigator role. An address identifies a **key**, not a person; who controls each address is an organisational process, `DECISION:`.)
- **Continuity:** every custody transfer since submission is recorded, in order, with nothing removed. (Implemented: entries are append-only and hash-chained on chain; `verifyCustodyChain` recomputes the chain.)
- **Non-claims:** the system does **not** prove the evidence is authentic, lawfully obtained, or unaltered *before* submission. State this explicitly for users.

## 2. Assets

- Evidence file contents (may be sensitive, personal or privileged).
- Evidence metadata: case IDs, file names, submitter, timestamps.
- The custody log (its order, completeness and authorship), now on chain.
- The role assignments: who may write evidence is itself an asset, because a forged Investigator grant lets someone register false evidence.
- Credentials and keys: upload/storage API keys, wallet keys of Investigators, **the Chief (admin) key**, session cookies (random 256-bit ids, httpOnly, held in server memory).
- Reputation of the process: a single successful forgery can taint every record.

## 3. Actors and adversaries

| Actor | Trusted for | Concern |
| --- | --- | --- |
| Investigator (evidence officer) | Registering evidence, logging access and verification, transferring custody they hold | Mistakes, coercion, stolen device or wallet; can register a false hash or log false events with their own key. |
| Chief (Admin) | Granting and revoking roles, pausing, reassigning stranded custody | Key theft or abuse: can authorise a malicious Investigator. By design cannot write evidence on its own. |
| Auditor | Reading and checking | No write permission. Does not get secrecy: all chain data is readable by everyone. |
| Reviewer / court / opposing party | Reading and checking records | Needs a check that does not depend on trusting the operator. |
| System operator | Running servers, the upload proxy and the (planned) API | Insider tampering, key theft. The operator can run the proxy but cannot change the chain without a role. |
| Network operator (permissioned chain) | Running the nodes | Could in principle rewrite history on a private network; mitigated by independent anchoring (planned). |
| External attacker | Nothing | Steals keys, forges identities, replays messages, scrapes public data. |
| Malicious or careless insider | Has legitimate access | Substitutes or deletes evidence, backdates entries. |
| Third-party services (storage, RPC, CDN, fonts) | Availability only | Outages, logging, takedowns, content changes. |

Decided 2026-10-23 (roadmap D3): the operator is trusted, with independent anchoring so that it cannot silently rewrite history. `DECISION:` the rest of the scope, in particular the network operator.

## 4. Trust anchors

One row per item. "Decided" rows are recorded in the roadmap decision log; `DECISION:` rows are still open.

| Question | Answer |
| --- | --- |
| Who holds which keys (signing, storage, admin)? | Decided (D3/D4): the agency operates the system. Investigators sign with their own wallet keys (ideally hardware wallets). File-encryption master key in an agency-controlled KMS/HSM; per-file keys, generated in the browser, are wrapped by it (built with an environment-variable master key in development; KMS/HSM still planned, Phase 2). Key releases are logged with the requesting address. The **Chief key** is the contract's admin: it grants roles, pauses and reassigns custody; it moves only by a two-step transfer with a waiting period (3 days by default). `DECISION (D12):` the Chief should be a multisig of hardware wallets; who the signers are; the lost-key and compromise runbook. |
| What is recorded on chain (if anything): hash only, hash plus metadata, nothing? | **Amended 2026-10-26 (D5):** a per-evidence register: SHA-256 of the evidence bytes, the CID of the stored copy, an opaque `caseRef`, submitter and custodian addresses, timestamps, a hash-chained custody trail, and the role grants. No names of suspects or victims, no case numbers or titles, no file names. **Officer addresses and what they touched are on the ledger.** |
| What stays off chain (file bytes, names, case IDs)? | File bytes (which must be encrypted before storage), file names, case numbers and titles, personal data. Case titles and officers are currently sample data matched by `caseRef`; a database holds them once the API exists (Phase 1). Note `caseRef` is today an **unsalted** hash of the case number, so a guessed case number can be confirmed; an HMAC with a server secret replaces it (roadmap Phase 3). |
| Which chain or timestamping service, and who pays for and operates it? | **Amended (D6):** Sepolia for development only; production on a **permissioned or private network** because of the public-chain exposure above; independent anchoring of a digest of the registry state on a public chain and with an RFC 3161 authority so the network operator cannot silently rewrite history. `DECISION:` the network and operator, the RFC 3161 authority (depends on the jurisdiction), and who pays. |
| Where do the file bytes live, and who can read them? | **Amended (D7, owner to confirm):** an **encrypted** copy in a store the agency controls; the ledger holds only its content identifier. The development build pins an **encrypted** copy to public IPFS (Pinata); the decryption key stays in the server key store (T4). `DECISION:` the production store and identifier. |
| What is the root of trust for a reviewer checking a record years later? | The contract code and its state on the network, plus the independent anchors once they exist. A reviewer can call `verify` and `verifyCustodyChain`, or recompute the custody hash chain themselves from the exported JSON case record (the rule is written in the file), without using the application. This only holds if the deployed bytecode is the audited, published one: `DECISION:` how the deployment is attested and kept verifiable. |

## 5. Threats

"Status today" describes the code in this repository, not a hoped-for design.

| # | Threat | Example | Status today |
| --- | --- | --- | --- |
| T1 | **Key leakage** | A storage token in a `VITE_*` variable is inlined into the public bundle and copied by anyone. | **Happened twice in this repository's history:** once with the original client-side upload, and once during the RBAC build when code read `import.meta.env` as a whole object. Fixed; a source test and `npm run check:bundle` (also in CI) now fail on it, and the scan was verified to fail on a planted leak. The legacy `VITE_PINATA_*` values may still be in a local `.env`: **rotate them and rename the JWT to `PINATA_JWT`.** |
| T2 | **Forged submitter identity** | Someone registers or logs as an officer they are not. | **Writes need a transaction signed by an address holding the Investigator role, enforced by the contract.** That binds an action to a key, not a person; a stolen or shared key is the remaining risk (see T11). No server-side login yet (roadmap Phase 1). |
| T3 | **Hash substitution** | The stored hash is swapped, or the file is replaced and re-hashed, after submission. | **Mitigated for registered evidence:** the register is append-only (no function edits or deletes an entry; a test lists the exact set of state-changing functions) and a re-check compares on chain. **Not mitigated before registration** (see T13). |
| T4 | **Unencrypted evidence on public IPFS** | Pinned content is world-readable and effectively permanent; a CID is a capability. | **Mitigated in the development build (2026-10-26):** the browser encrypts each file with its own AES-256-GCM key before pinning, and only the ciphertext (under a neutral name) reaches IPFS. Residual risks: the ciphertext is permanent, so its safety rests on AES-256 and on the key store; the key store releases keys to **any signed-in wallet** (no role check yet) and its master key is an environment variable, not a KMS/HSM. Do not register real evidence. |
| T5 | **Replay** | A valid signed message or request is resent to re-submit, re-assign or re-approve. | On chain, transaction nonces prevent replay. Off chain, the wallet sign-in (EIP-4361) uses single-use server nonces that expire after 5 minutes and are consumed even by a failed attempt; the message must name this site's host. A replayed or forged login is rejected (tested in `server/siweAuth.test.js`). |
| T6 | **Metadata privacy on public chains** | Case IDs, addresses and timing are public and linkable forever, even if file bytes are private. | **Present by design on any public network:** officers' addresses, when they acted and which evidence they touched are public and permanent, and `caseRef` is an unsalted hash. Production must use a permissioned or private network (D6). Sepolia is for development only. |
| T7 | **Log tampering or truncation** | Entries are edited, reordered, backdated or silently dropped. | **Mitigated on chain:** append-only, ordered, hash-chained per evidence item, with a recompute check (`verifyCustodyChain`) that the dashboard runs. Residual: a **permissioned network's operator** could rewrite history; independent anchoring (Phase 3) is not built. |
| T8 | **Availability and loss** | Storage provider drops content, RPC goes down, keys are lost. | Open. The Chief can pause writes and reassign custody if an Investigator's key is lost, and every reassignment is recorded. A lost **Chief** key is not recoverable by design: hence a multisig (D12). Pinned content can disappear if unpinned; no backup yet. |
| T9 | **Client-side compromise** | A malicious extension or XSS alters what the user sees or signs. | Possible. In place: no secret reaches the browser (scanned) and no `dangerouslySetInnerHTML`. Not built: a content-security policy, a hardware-wallet policy. The wallet shows the transaction the user signs, which is the last line of defence. |
| T10 | **Chief key compromise or abuse** | An attacker or a rogue Chief grants themselves the Investigator role and registers false evidence. | **Partly mitigated by design:** the Chief cannot write evidence without also holding the Investigator role, and the grant is a public, permanent event, so abuse is visible after the fact; the Chief role moves only by a delayed two-step transfer. **Not prevented**, and a single personal wallet is a single point of failure: use a multisig (D12), and watch role events (alerting not built). |
| T11 | **Investigator key compromise or insider** | A stolen or coerced key registers false evidence, logs false events, or takes custody. | Open. Actions are attributable to the key and permanent; the Chief can revoke the role, pause the system, and reassign custody (recorded). Nothing prevents a valid key from lying; this is an organisational control (hardware wallets, supervision, review of the audit trail). |
| T12 | **Contract defect or unintended behaviour** | A bug lets an unauthorised wallet write, or locks evidence. | The contract is small, uses OpenZeppelin's access control, and has a tripwire test on its state-changing surface and mutation-checked tests. **No external audit yet**, no formal verification or fuzzing, and the contract is not upgradeable, so a fix means a new deployment and a migration plan. An audit is mandatory before real use (Phase 5). |
| T13 | **Garbage in: the wrong hash is registered** | The browser hashes the wrong file, or a compromised browser reports a hash the file does not have. | Open. The ledger proves the bytes have not changed **since registration**, not that they were genuine before it. Mitigation planned: the server re-hashes what it receives and refuses a mismatch (Phase 2). |
| T14 | **UI role guards mistaken for security** | A reviewer assumes hidden buttons or guarded routes protect data. | By design they do not: they are a convenience. The contract rejects every unauthorised write (tested for each role and function), and chain data is public to read. |

## 6. Mitigations

Marked **built** where the repository has them; the rest are options, not commitments. Each needs an owner decision and a cost estimate.

- **Built: role-based access control in the contract** (OpenZeppelin `AccessControlDefaultAdminRules`): Investigator and Auditor roles, a single Chief with a delayed two-step transfer, separation of duties (the Chief cannot write evidence), a pause switch, and logged custody reassignment. Append-only: no function edits or deletes a record.
- **Built: tamper-evident custody:** each evidence item's custody entries are hash-chained on chain and re-checked from the dashboard; the case export lets a reviewer recompute the chain without the application.
- **Built: fail-closed UI roles:** nothing is allowed while the role is unknown, on error, on the wrong network or when no contract is configured in a production build; roles of a previous account are never reused.
- **Built: secret-leak guards:** a test that forbids reading `import.meta.env` whole, and a bundle scan in CI.

- **Server-side upload proxy** with scoped, short-lived storage keys, rate limits and logging; the browser never holds a secret.
- **Sign-In with Ethereum (SIWE) with roles read from the contract (D11):** server-verified signature, nonce and expiry; the API reads `rolesOf` from the chain instead of keeping its own allowlist (addresses T2 and T5).
- **Independent anchoring:** periodically anchor a digest of the registry state on a public chain and obtain an RFC 3161 timestamp, so the operator of a permissioned network cannot silently rewrite history (T7).
- **Chief as a multisig of hardware wallets**, with a rehearsed runbook for pausing, revoking and reassigning (T10, T8).
- **Permissioned or private production network** (T6).
- **Salted case references** computed server-side with an HMAC (T6).
- **Server-side hash check** before registration (T13).
- **Monitoring of role-change and reassignment events** with alerts (T10, T11).
- **Client-side encryption before any public storage**, with key management defined (who can decrypt, key loss, key rotation) (T4, T6).
- **Trusted timestamping** (RFC 3161 or a public-chain anchor) for the "existed no later than" claim.
- **Store minimal data on chain:** hashes, opaque references and addresses, never names or case numbers (T6); already followed by the contract.
- **Independent verification path:** a reviewer can recompute the hash and check the anchor without using the operator's UI.
- **Operational:** secret scanning in CI, key rotation runbook, dependency review, backups of the log.

## 7. Open questions

1. ~~Portfolio demo or real product?~~ Answered 2026-10-23: **real product**; everything above is mandatory.
2. ~~Who are the users?~~ Answered: **law enforcement**. `OPEN:` which country or state applies; it decides evidence-handling standards, data-residency rules and which timestamp authorities courts accept.
3. What retention, deletion and privacy obligations exist (for example, GDPR erasure versus an immutable log)?
4. What must a record contain to be useful to a court? A **forensics practitioner and legal counsel should review** this model, the process and the admissibility requirements before any real use.
5. Who is accountable when a key is lost or an officer account is compromised?
6. ~~Is on-chain anchoring actually needed?~~ Answered, then amended 2026-10-26: an on-chain per-evidence register is in scope (D5). `OPEN:` is that acceptable for police data at all given T6, even on a permissioned network? May officers be pseudonymous addresses on a shared ledger?
7. Who is the Chief, and what is the multisig (D12)? What happens if the Chief key is lost, or the Chief leaves?
8. What does "Auditor" need? The role has no on-chain power and no secrecy. Is a named role useful, or should auditors simply read the chain (and the exported record) like anyone else?
9. How is the deployed contract attested, and how do we handle a defect in an immutable contract (a new deployment and a migration of live evidence)?
10. Should the `caseRef` salt be per agency, per case, or global, and who holds it?

## 8. Review log

| Date | Reviewer | Notes |
| --- | --- | --- |
| 2026-10-26 | Claude (AI assistant, author of the changes) | Updated for the on-chain RBAC design: trust anchors, threats T1 to T14 with status, mitigations. **This is not an independent review.** It was prepared alongside the code and may share its blind spots. Needs review by a security engineer, a forensics practitioner and legal counsel. |
