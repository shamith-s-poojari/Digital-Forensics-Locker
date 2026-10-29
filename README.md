# Digital Forensics Locker

A chain-of-custody system for digital evidence. A React web app and a Solidity smart contract (`EvidenceLocker`) record, for each evidence item, its SHA-256, the content identifier (CID) of the stored copy, and an append-only, hash-chained custody trail, with role-based access control enforced by the contract.

> **Status: development prototype.** The contract has **not been audited or deployed**, the system has not been reviewed by a forensics practitioner or legal counsel, and it is **not evidence-grade**. Do not use it for real evidence. See [Known limitations](#known-limitations).

## How it fits together

```
 Browser (React)                                  Blockchain                    Storage
 ┌────────────────────────────┐   wallet signs   ┌─────────────────────┐      ┌──────────────┐
 │ Case dashboard             │ ───────────────▶ │ EvidenceLocker      │      │ IPFS (Pinata)│
 │ Evidence upload            │                  │  roles (RBAC)       │      │ via a server │
 │ Role management            │ ◀─── reads ───── │  evidence + custody │      │ -side proxy  │
 │ SHA-256 hashing (local)    │                  │  hash chain         │      └──────▲───────┘
 └──────────────┬─────────────┘                  └─────────────────────┘             │
                └──────────── file pinned through /api/pin (holds the Pinata key) ───┘
```

- **The contract is the source of truth.** It decides who may write; the web app reads roles from it (`rolesOf`).
- **The web app only decides what to show.** Hidden buttons and guarded routes are a courtesy to honest users. Every write is checked again by the contract, so removing a guard never grants access.
- **A ledger adapter** gives the app one interface over two implementations: the real contract (`src/web3/ethersLedger.js`) and an in-memory demo ledger for development (`src/web3/demoLedger.js`). One shared scenario suite runs against both, including the real contract on a local Hardhat chain.

## Roles

| | Chief | Admin | Investigator | Auditor |
| --- | --- | --- | --- | --- |
| View cases, evidence, custody timeline | yes | yes | yes | yes |
| Check a file against the ledger (free, read-only) | yes | yes | yes | yes |
| Register evidence | **no** | **no** | yes | no |
| Log access, record a verification result | **no** | **no** | yes | no |
| Transfer custody | **no** | **no** | only the current custodian, only to another Investigator | no |
| Grant and revoke Investigator / Auditor, decide access requests | yes | yes | no | no |
| Appoint and remove Admins | yes | **no** | no | no |
| Pause and resume all evidence writes | yes | yes | no | no |
| Reassign custody when the custodian cannot act | yes (recorded as such) | no | no | no |

- **Chief and Admins:** there is one Chief (the contract's `DEFAULT_ADMIN_ROLE`) and any number of Admins (`ADMIN_ROLE`), whom only the Chief appoints. Admins share the day-to-day role management so the Chief is not a bottleneck.
- **Separation of duties:** neither the Chief nor an Admin can write evidence unless also given the Investigator role.
- **The Chief role** is one address, moved only by the contract's two-step transfer with a waiting period. Use a multisig, not a personal wallet, for anything real.
- **"Auditor is read-only" means "no write permission", not secrecy.** Blockchain reads cannot be restricted, so every view function is open. Privacy comes from what is stored (below), not from who may read.

## What is on the chain

Stored: the SHA-256 of the evidence bytes, the CID of the stored copy, an opaque `caseRef` (the contract's `uint256 caseId`), a salted digest of the case's title and description (`caseDigest`, see [Case details](#case-details)), the submitter and custodian addresses, timestamps, and each custody entry (who, what, when) chained by hash so that tampering is detectable. Role grants are on chain too.

Each registration is an immutable **256-byte record** (8 storage slots: evidence SHA-256, CID, officer address, block timestamp, case id, link; the CID is held to 33..64 bytes so it fills exactly two data slots). The records of a case form a SHA-256 chain: `h_0 = SHA256(caseId)`, `h_i = SHA256(h_{i-1} || e_i || CID_i || W_i || T_i)` (packed), stored as each record's `link`. The timestamp comes from the block, never from the caller. `verifyCaseChain(caseId)` walks a case and returns the first mismatching index; `computeLink` and `caseGenesis` let anyone check their own implementation. `EvidenceRegistered` has the evidence hash as its first indexed topic, so finding every registration of a file is one log query.

Not stored: file bytes, file names, case numbers or titles, personal data.

**Public-chain privacy warning.** On a public chain, officers' addresses, when they acted and which evidence they touched are public and permanently linkable. For real law-enforcement use deploy on a permissioned or private network. Sepolia is for development only. Also note that `caseRef` is currently an **unsalted hash** of the case number, so anyone who can guess a case number can confirm which records belong to it; a server-side secret (an HMAC) is planned.

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
```

With no contract configured, a development build runs on the **in-memory demo ledger** with sample data. It enforces roles like the contract: a wallet only gets in if it holds a role, and any other wallet sees **Access Denied: Address not registered**.

**Getting access.** On the Access Denied screen a wallet can **request a role** (Admin, Investigator or Auditor, with an optional reason). The Chief and Admins see pending requests, with a count on the Role Management link, and approve (which grants the role on the ledger) or reject. Only the Chief can approve an Admin request. A request grants nothing by itself. On the demo ledger, if nobody is the Chief yet, the Access Denied screen also offers **Make this wallet the Chief**. To try it with one browser, use two MetaMask accounts: make the first the Chief, switch to the second and request a role, then switch back to approve. Demo roles and requests are lost when the page reloads.

To keep roles across reloads, give your own MetaMask accounts roles in `.env` (use a different account per role to try each one), then restart `npm run dev`:

```bash
VITE_DEMO_CHIEF=0xYourChiefAccount
VITE_DEMO_ADMINS=0xYourAdminAccount
VITE_DEMO_INVESTIGATORS=0xYourInvestigatorAccount
VITE_DEMO_AUDITORS=0xYourAuditorAccount
```

The Chief can also grant and revoke roles on the Role Management page, but those changes are lost when the page reloads. Every page load starts signed out: you connect, sign in and have your role read again. Nothing is recorded anywhere, and a **production build with no contract configured grants access to nobody**.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload (demo ledger unless a contract is configured). |
| `npm run build` | Production build into `dist/`. |
| `npm run check:bundle` | Fails if `dist/` contains anything secret-like (a JWT, a private key, a credential-named `VITE_` variable). Run after `build`; CI does. |
| `npm run preview` | Serve the production build. |
| `npm run lint` | ESLint. |
| `npm test` | Web app tests (Vitest and Testing Library). |

CI (`.github/workflows/ci.yml`) runs lint, tests, build and the bundle scan, and a second job compiles and tests the contracts and checks that the shipped ABI matches the compiled one.

### Using a real contract

```bash
cd contracts
npm install
npm test                                # compile and run the contract tests, including the ledger scenarios
npx hardhat run scripts/deploy.ts       # deploy to an in-memory chain and print the settings (nothing persists)
```

To test real on-chain roles with MetaMask, run a local chain and deploy to it with roles granted:

```bash
cd contracts
npx hardhat node        # terminal 1, leave running; prints test accounts and their private keys
```

```bash
cd contracts
ADMINS=0xYourAdminAccount INVESTIGATORS=0xYourInvestigatorAccount AUDITORS=0xYourAuditorAccount npx hardhat run scripts/deploy.ts --network localhost
```

The Chief is the first test account printed by `hardhat node`; import its private key into MetaMask (it is a public, test-only key) to manage roles. Add the network to MetaMask (RPC `http://127.0.0.1:8545`, chain id 31337), copy the printed `VITE_*` values into `.env` and restart `npm run dev`. The accounts you name are sent 10 test ETH for gas. Restarting `hardhat node` wipes the chain, so deploy again after a restart.

To deploy to Sepolia, store `SEPOLIA_RPC_URL` and a **throwaway testnet** `DEPLOYER_PRIVATE_KEY` in Hardhat's encrypted keystore (`npx hardhat keystore set ...`) and run the deploy script with `--network sepolia`; see [`contracts/README.md`](contracts/README.md). To host the app for several machines on Railway, follow [`docs/DEPLOY_RAILWAY.md`](docs/DEPLOY_RAILWAY.md). That path has not yet been exercised end to end in this repository. The script prints the values to put in `.env`:

| Variable | Public? | Purpose |
| --- | --- | --- |
| `VITE_LOCKER_ADDRESS` | public | Deployed contract address. Empty means demo ledger (development) or no access (production). |
| `VITE_CHAIN_ID` | public | Network the contract is on (default Sepolia, 11155111). A wallet on another network is asked to switch. |
| `VITE_LOCKER_DEPLOY_BLOCK` | public | Where to start scanning event logs for transaction links. |
| `VITE_EXPLORER_URL` | public | Block explorer base URL (defaults for Sepolia and Mainnet). |
| `VITE_IPFS_GATEWAYS` | public | Comma-separated IPFS gateways tried in order when verifying a stored copy (default `https://ipfs.io/ipfs/,https://gateway.pinata.cloud/ipfs/`). HTTPS only, or plain HTTP to a local node. |
| `PINATA_JWT` | **secret, server only** | Pinata key used by the upload proxy. Never prefix it with `VITE_`. |
| `EVIDENCE_MASTER_KEY` | **secret, server only** | 32 random bytes (base64) that wrap every file's decryption key. Losing it makes every encrypted file unreadable: back it up off this machine. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `EVIDENCE_MASTER_KEY_VERSION` | server only | Recorded with each wrapped key, for later rotation (default 1). |
| `EVIDENCE_KEY_STORE`, `EVIDENCE_KEY_ACCESS_LOG` | server only | Where wrapped keys and the key-release log are written (default `.data/`, git-ignored). |
| `CASE_STORE` | server only | Where the case store keeps case titles, descriptions and their version history (default `.data/cases.json`, git-ignored). |

After changing the contract, run `npm run abi` in `contracts/` to refresh `src/web3/EvidenceLocker.abi.json`; CI fails if it is stale.

## IPFS upload setup

1. Create a **new** Pinata API key (JWT) with only the `pinFileToIPFS` permission.
2. Put it in `.env` as `PINATA_JWT=...` (**no `VITE_` prefix**), add `EVIDENCE_MASTER_KEY` (see the table above), then restart `npm run dev`. The proxy still accepts the legacy `VITE_PINATA_JWT` name for now and prints a warning, but that name is a leak waiting to happen.
3. Register evidence from the upload page. If the key is missing or wrong, the page shows the server's error against the pinning step and nothing is sent to the ledger.

What the proxy enforces (`server/pinataProxy.js`): POST only, `multipart/form-data` only, 10 MB cap, a required `X-Requested-With` header (blocks cross-site form posts), same-origin `Origin` check, 30 s upstream timeout, and errors that never echo the token. It also requires a wallet sign-in session (below) and, with a contract configured, the Investigator role read from the contract (`server/chainRoles.js`; the key store, case store and access requests check roles the same way). Do not expose `npm run dev` to an untrusted network: on the demo ledger it cannot check roles, so any signed-in wallet can spend your Pinata quota. The production server (`npm start`, used on Railway) always checks roles and grants nothing without a contract. Sessions are kept in the server's memory, so it runs as a single instance; a shared session store is still to do.

### Encryption before pinning

The upload page hashes the **original** file (that SHA-256 is what the ledger records and verifies), then encrypts it in the browser with a fresh random AES-256-GCM key (`src/crypto/evidenceCrypto.js`). The key is sent to the key store (`server/keyStore.js`, `POST /api/keys`), which wraps it with `EVIDENCE_MASTER_KEY` and writes only the wrapped form to disk. Only then is the **encrypted copy** pinned, under a neutral file name. The original file and its name never leave the browser.

The pinned file starts with a 68-byte header (format version, key id, IV, plaintext SHA-256) that is authenticated together with the ciphertext, so it cannot be edited unnoticed. To open evidence, choose the encrypted copy in **Check a file against the ledger** on the dashboard: the app checks your sign-in, fetches the key (`GET /api/keys/:keyId`, logged with your address), decrypts in the browser, hashes the plaintext, compares it with the ledger, and offers the decrypted file.

Development limits: the master key is an environment variable, not a KMS or HSM; **any signed-in wallet can fetch any key** (the server does not check on-chain roles yet); the key store is a JSON file for one process. The encrypted copy on public IPFS is permanent, so its safety rests on AES-256 and on the key store. Do not register real evidence yet (see the [roadmap](docs/ROADMAP.md), D4 and D7).

## Case details

Case titles and descriptions are sensitive, so they stay off chain in a case store: `server/caseStore.js` (`/api/cases`, needs a wallet sign-in) with a real contract, or an in-memory store seeded with the fictional sample cases with the demo ledger (`src/cases/caseStores.js`). The store keeps an **append-only version history**: an edit adds a version and never changes an earlier one, and no endpoint deletes a version.

Each evidence registration anchors the digest of the case's **current** version on chain:

```
caseDigest = SHA256( UTF-8( JSON.stringify(["dfl-case-details/v1", caseRef, caseNumber, title, description, salt]) ) )
```

Strings are trimmed and NFC-normalised; `salt` is 32 random bytes chosen per version and kept off chain, so nobody can guess a likely title and confirm it against the public chain (`src/cases/caseDigest.js`, shared by the browser and the server). The upload page looks up the case by its number; for a new case it asks for a title and creates version 1 first. The contract stores `caseDigest` beside the 256-byte record (the record layout and the link formula are unchanged) and emits it in `EvidenceRegistered`.

The dashboard's **Case details** panel recomputes every version's digest from its fields (the stored digest is not trusted) and matches each record's anchored digest to a version (`src/verify/verifyCaseDetails.js`):

| Result | Meaning |
| --- | --- |
| Matches the anchored version | Every anchor matches a version, and the current version is anchored by at least one record. |
| Edited, not yet anchored | Every anchor matches, but the case was edited after its last record; the next record registered in the case anchors the new version. |
| **Does not match what was anchored** | A record anchored a digest that no stored version reproduces: the history was edited, or a version removed, after it was anchored. The panel names each such record. |
| No case details | The case has records but the store has no entry for it. |

Investigators can edit the details there (as a new version); the exported JSON case record includes every version with its salt and the digest rule, so a reviewer can repeat the check without this application. What the check proves: the stored text is the text that was anchored when each record was registered. It does not prove that text was accurate, and an edit made since the last record is only "not yet anchored", not confirmed.

Development limits: any signed-in wallet can read, create and edit case details (no on-chain role check on the server yet); the store is a JSON file for one process.

## Verification

Three checks run in the browser, on the case dashboard (`src/verify/`): the two below, and the case-details check described under [Case details](#case-details).

- **One evidence item: Fetch from IPFS and verify.** The app downloads the stored copy by the CID on the ledger (from the gateways in `VITE_IPFS_GATEWAYS`, in order, capped at the 10 MB limit), decrypts it if it is an encrypted copy (this needs a sign-in, and the key release is logged), hashes the **original** bytes locally and asks the contract whether that hash is the registered one. A gateway is not trusted: altered bytes fail decryption, and the hash is compared with the chain, so a gateway can make a check fail but never pass. The same pipeline checks a file you choose from disk.
- **A whole case: Case chain.** The selected case's records are taken in order and every link is recomputed from the record's own fields and the previous link (`h_0 = SHA256(caseId)`, `h_i = SHA256(h_{i-1} || e_i || CID_i || W_i || T_i)`), stopping at the first mismatch. It reports which record broke and why (link mismatch, missing or out-of-order record, record from another case); later records are marked not checked. This walk re-derives the result from the record data and does not ask the contract; the contract's own `verifyCaseChain` is a second, independent check.

Privacy: a public gateway learns that someone fetched a given CID, and from which IP address.

## Security notes

- **Never put secrets in `VITE_*` variables, and never read `import.meta.env` as a whole object.** Vite copies every `VITE_*` value into the public bundle, and reading the whole object copies all of them. This has already happened once in this repository; `src/web3/noBareEnv.test.js` and `npm run check:bundle` now guard against it.
- **Rotate any key that was ever in a `VITE_*` variable** (for example a Pinata JWT or API key used by an earlier version). Assume it is compromised, including anything in a deployed build or in git history, and revoke it at the provider.
- `.env` and `.env.*` are git-ignored (only `.env.example` is tracked). Do not commit real values.
- **Wallet sign-in (EIP-4361).** Connecting asks the wallet to sign a message containing a single-use server nonce (`server/siweAuth.js`, `src/auth/`). The server checks the signature, then sets an httpOnly, `SameSite=Strict` session cookie that lasts one hour. The session is bound to one address: if the wallet locks, disconnects or switches account, the app ends the session at once, and every evidence action (upload, custody, access and verification logs, role changes) first re-reads the wallet's selected account and asks for a fresh signature when needed. A session proves who is acting but grants nothing: roles are enforced by the contract. Limits: sessions live in the dev server's memory (a restart signs everyone out), and the server does not yet read the signer's roles (roadmap Phase 1).
- A hash computed in a browser is only as trustworthy as that browser. The ledger proves the registered bytes have not changed since registration, not that the evidence was genuine or intact before it.

## Roadmap and threat model

- [`docs/ROADMAP.md`](docs/ROADMAP.md): phases, exit criteria, the per-task process loop and the decision log.
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md): assets, adversaries, trust anchors and the status of each threat.
- [`contracts/README.md`](contracts/README.md): the contract, its roles and how it is tested.

## Known limitations

- Prototype: not audited, not deployed, not legally reviewed. An external contract audit and a forensics and legal review are required before any real use (roadmap Phases 5 and 6).
- Public-chain privacy (see above), and the unsalted `caseRef`.
- Files are encrypted before they are pinned, but the key server releases a key to **any signed-in wallet** (no role check yet), its master key is an environment variable, and the pin proxy likewise checks only for a sign-in.
- No backend or database yet: sign-in sessions, wrapped keys and case details are kept by the Vite dev server (memory and JSON files under `.data/`), and the server checks only for a sign-in, not for an on-chain role. With the demo ledger, case titles are fictional sample data.
- In-browser hashing reads the whole file into memory, so it is limited to 10 MB.
- The PDF custody report still exists only for the development sample pages; the dashboard exports a JSON case record instead.
- The two sample pages (Evidence Viewer, Chain of Custody) show fictional data and exist in development builds only.
- The main bundle is about 650 KB (the `ethers` library); code splitting is not done yet.
- No end-to-end or cross-browser tests beyond the unit and component tests.

## Project layout

```
contracts/                 Solidity contract, Hardhat tests, deploy and ABI-export scripts
server/                    Dev-server handlers mounted by vite.config.js: Pinata upload proxy, wallet sign-in,
                           key store, case store
src/cases/                 Case details: digest, demo and server stores, the case directory provider
scripts/check-bundle.mjs   Secret scan for the production bundle
src/web3/                  Ledger adapter (ethers + demo), roles, errors, hooks, case model
src/context/               Wallet and role providers
src/components/            Layout, navigation, route guard (RequireCapability), Can, UI kit, case dashboard parts
src/pages/                 Case dashboard, evidence upload, role management (+ two sample pages in dev)
docs/                      Roadmap, threat model
```
