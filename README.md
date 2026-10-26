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

| | Admin (Chief) | Investigator | Auditor |
| --- | --- | --- | --- |
| View cases, evidence, custody timeline | yes | yes | yes |
| Check a file against the ledger (free, read-only) | yes | yes | yes |
| Register evidence | **no** | yes | no |
| Log access, record a verification result | **no** | yes | no |
| Transfer custody | **no** | only the current custodian, only to another Investigator | no |
| Grant and revoke Investigator / Auditor | yes | no | no |
| Pause and resume all evidence writes | yes | no | no |
| Reassign custody when the custodian cannot act | yes (recorded as such) | no | no |

- **Separation of duties:** the Chief manages roles but cannot write evidence unless also given the Investigator role.
- **The Chief role** is one address, moved only by the contract's two-step transfer with a waiting period. Use a multisig, not a personal wallet, for anything real.
- **"Auditor is read-only" means "no write permission", not secrecy.** Blockchain reads cannot be restricted, so every view function is open. Privacy comes from what is stored (below), not from who may read.

## What is on the chain

Stored: the SHA-256 of the evidence bytes, the CID of the stored copy, an opaque `caseRef`, the submitter and custodian addresses, timestamps, and each custody entry (who, what, when) chained by hash so that tampering is detectable. Role grants are on chain too.

Not stored: file bytes, file names, case numbers or titles, personal data.

**Public-chain privacy warning.** On a public chain, officers' addresses, when they acted and which evidence they touched are public and permanently linkable. For real law-enforcement use deploy on a permissioned or private network. Sepolia is for development only. Also note that `caseRef` is currently an **unsalted hash** of the case number, so anyone who can guess a case number can confirm which records belong to it; a server-side secret (an HMAC) is planned.

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
```

With no contract configured, a development build runs on the **in-memory demo ledger** with sample data. After connecting a wallet, the bar under the banner lets you preview the interface as each role. Nothing is recorded anywhere, and a **production build with no contract configured grants access to nobody**.

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

To deploy to Sepolia, store `SEPOLIA_RPC_URL` and a **throwaway testnet** `DEPLOYER_PRIVATE_KEY` in Hardhat's encrypted keystore (`npx hardhat keystore set ...`) and run the deploy script with `--network sepolia`; see [`contracts/README.md`](contracts/README.md). That path has not yet been exercised end to end in this repository. The script prints the values to put in `.env`:

| Variable | Public? | Purpose |
| --- | --- | --- |
| `VITE_LOCKER_ADDRESS` | public | Deployed contract address. Empty means demo ledger (development) or no access (production). |
| `VITE_CHAIN_ID` | public | Network the contract is on (default Sepolia, 11155111). A wallet on another network is asked to switch. |
| `VITE_LOCKER_DEPLOY_BLOCK` | public | Where to start scanning event logs for transaction links. |
| `VITE_EXPLORER_URL` | public | Block explorer base URL (defaults for Sepolia and Mainnet). |
| `PINATA_JWT` | **secret, server only** | Pinata key used by the upload proxy. Never prefix it with `VITE_`. |

After changing the contract, run `npm run abi` in `contracts/` to refresh `src/web3/EvidenceLocker.abi.json`; CI fails if it is stale.

## IPFS upload setup

1. Create a **new** Pinata API key (JWT) with only the `pinFileToIPFS` permission.
2. Put it in `.env` as `PINATA_JWT=...` (**no `VITE_` prefix**), then restart `npm run dev`. The proxy still accepts the legacy `VITE_PINATA_JWT` name for now and prints a warning, but that name is a leak waiting to happen.
3. Register evidence from the upload page. If the key is missing or wrong, the page shows the server's error against the pinning step and nothing is sent to the ledger.

What the proxy enforces (`server/pinataProxy.js`): POST only, `multipart/form-data` only, 10 MB cap, a required `X-Requested-With` header (blocks cross-site form posts), same-origin `Origin` check, 30 s upstream timeout, and errors that never echo the token. It has **no user authentication**, so do not expose a dev or preview server to an untrusted network: anyone who can reach `/api/pin` can spend your Pinata quota. A deployed site needs the same handler mounted on a real server with authentication; that is not included.

**Pinned files are public and unencrypted.** Do not register real evidence until encrypted storage is in place (see the [roadmap](docs/ROADMAP.md), D4 and D7).

## Security notes

- **Never put secrets in `VITE_*` variables, and never read `import.meta.env` as a whole object.** Vite copies every `VITE_*` value into the public bundle, and reading the whole object copies all of them. This has already happened once in this repository; `src/web3/noBareEnv.test.js` and `npm run check:bundle` now guard against it.
- **Rotate any key that was ever in a `VITE_*` variable** (for example a Pinata JWT or API key used by an earlier version). Assume it is compromised, including anything in a deployed build or in git history, and revoke it at the provider.
- `.env` and `.env.*` are git-ignored (only `.env.example` is tracked). Do not commit real values.
- A connected wallet shows which account the browser reports. The web app does not authenticate users to a server yet (no signed login, no sessions); roles are enforced by the contract, and the planned API (roadmap Phase 1) will re-check them.
- A hash computed in a browser is only as trustworthy as that browser. The ledger proves the registered bytes have not changed since registration, not that the evidence was genuine or intact before it.

## Roadmap and threat model

- [`docs/ROADMAP.md`](docs/ROADMAP.md): phases, exit criteria, the per-task process loop and the decision log.
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md): assets, adversaries, trust anchors and the status of each threat.
- [`contracts/README.md`](contracts/README.md): the contract, its roles and how it is tested.

## Known limitations

- Prototype: not audited, not deployed, not legally reviewed. An external contract audit and a forensics and legal review are required before any real use (roadmap Phases 5 and 6).
- Public-chain privacy (see above), and the unsalted `caseRef`.
- Files are pinned **unencrypted to public IPFS**, and the pin proxy has no user authentication.
- No backend, database or server-side authentication yet. Case titles and officers come from sample data, matched by `caseRef`, because the chain holds only opaque references.
- In-browser hashing reads the whole file into memory, so it is limited to 10 MB.
- The PDF custody report still exists only for the development sample pages; the dashboard exports a JSON case record instead.
- The two sample pages (Evidence Viewer, Chain of Custody) show fictional data and exist in development builds only.
- The main bundle is about 650 KB (the `ethers` library); code splitting is not done yet.
- No end-to-end or cross-browser tests beyond the unit and component tests.

## Project layout

```
contracts/                 Solidity contract, Hardhat tests, deploy and ABI-export scripts
server/pinataProxy.js      Server-side Pinata upload proxy (mounted by vite.config.js)
scripts/check-bundle.mjs   Secret scan for the production bundle
src/web3/                  Ledger adapter (ethers + demo), roles, errors, hooks, case model
src/context/               Wallet and role providers
src/components/            Layout, navigation, route guard (RequireCapability), Can, UI kit, case dashboard parts
src/pages/                 Case dashboard, evidence upload, role management (+ two sample pages in dev)
docs/                      Roadmap, threat model
```
