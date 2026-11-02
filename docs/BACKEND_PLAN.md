# Backend plan: a standalone API at (almost) zero cost

Status: **proposal for the owner to approve, 2026-11-02.** Companion to [`ROADMAP.md`](ROADMAP.md) (this is its Phase 1 "API skeleton, database schema, SIWE login", scoped to free tiers) and [`THREAT_MODEL.md`](THREAT_MODEL.md). Constraint from the owner: the project must stay almost free of cost.

## 1. Where we are

The contract is live on Sepolia (`0xD96CfBF1b8F73fF3d10dD56D15160A10f8E5909F`, block 12039310) and the API already reads roles from it. But the API is not a server of its own:

| Piece | Today | Problem |
| --- | --- | --- |
| API process | Middleware inside the Vite dev/preview server (`createApi` in `vite.config.js`) | Runs only through Vite; the production build is served by `vite preview` |
| Case titles, access requests, wrapped evidence keys | JSON files in `.data/` (`server/caseStore.js`, `accessRequests.js`, `keyStore.js`) | Lost on any host without a persistent disk (every free host) |
| Key-release log | JSON-lines file `.data/key-access.log` | Same; and not queryable |
| Sign-in sessions and nonces | In-memory `Map`s (`server/siweAuth.js`) | A restart signs everyone out; one process only |
| On-chain history | Read by the browser through MetaMask's RPC, 9,000-block chunks | Fine for the UI; nothing server-side to search or report on |

The good news: every `server/*.js` module is already a plain Node `(req, res)` handler with injected `getSession` / `checkRole`, and has its own tests. Nothing below rewrites them; it moves them and swaps their storage.

## 2. Target architecture

```
Browser (React build) ──HTTPS──> Node server (one process, Render free)
   │  MetaMask                     ├─ serves dist/ (static + SPA fallback)
   │                               ├─ /api/auth   SIWE sign-in, sessions in Postgres
   │                               ├─ /api/cases, /api/access-requests, /api/keys, /api/pin
   │                               ├─ /api/audit  (Phase B4) key releases + indexed chain events
   │                               └─ role checks: contract via RPC_URL (unchanged)
   │                                         │
   └──writes (transactions)──> Sepolia <─────┘ reads (Alchemy free)
                                Neon Postgres (free) <── server stores
                                Pinata IPFS (free) <── encrypted evidence files
```

Same origin for page and API, so no CORS, and the session cookie stays `HttpOnly; Secure; SameSite`.

## 3. The free stack

Limits checked 2026-11-02; free tiers change, so recheck before signing up.

| Need | Choice | Free limit that matters | Fits? |
| --- | --- | --- | --- |
| Server hosting | **Render** free web service | 750 instance-hours per workspace per month (one always-on service needs ~744); **spins down after 15 min idle**, wakes in up to a minute; **no persistent disk** | Yes for a demo/project. The cold start is the price of free. |
| Database | **Neon** free Postgres | 0.5 GB storage per project, 100 CU-hours per month, scales to zero after 5 min idle | Yes: we store metadata only (case titles, wrapped keys, logs), kilobytes per case. |
| Evidence files | **Pinata** free (current) | about 1 GB, **500 files**, 10 GB bandwidth per month | The real ceiling: at most 500 uploads of up to 10 MB. Enough for a project. |
| Chain reads (server) | **Alchemy** free (current) | `eth_getLogs` limited to **10 blocks per request** | Yes for role checks. The indexer (B4) polls in 10-block steps or uses a free public Sepolia RPC. |
| Chain | **Sepolia** + faucet ETH | Faucet limits per day | Yes |
| Contract source on Etherscan | Etherscan free API key | n/a | Yes (B5) |
| Database driver | `pg` (npm) | n/a | One new dependency, MIT |

**Rejected:** Render free Postgres (expires 30 days after creation); Railway (the repo's current target, no longer free after the trial credit); Oracle Cloud Always Free VM (truly free and always on with disk, but needs a card at sign-up, server administration, and its Arm allowance was reportedly cut in 2026; keep as the fallback if Render's cold start becomes a problem); any paid KMS, paid RPC or hosted indexer.

**Expected monthly cost: $0.** The only spend risk is a provider changing its free tier.

## 4. Work plan

Each item follows the roadmap's process cycle (spec, tests first, small PR, CI green, review). Items B1 to B3 are needed to deploy; B4 and B5 are optional.

### B1. Standalone server, no behavior change (small) — built 2026-11-02, not yet committed

Done as planned: `server/api.js` (moved from `vite.config.js`), `server/app.js` (static files, host check, headers), `server/index.js` (entry, `.env` loading), `server/app.test.js`; `npm start` runs it.

- Move `createApi` and `createGate` from `vite.config.js` into `server/api.js`; `vite.config.js` imports them, so `npm run dev` behaves exactly as today.
- New `server/index.js`: `node:http` server that mounts the API, serves `dist/` with correct content types, falls back to `index.html` for client routes, and sends security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`). No Express needed.
- `npm start` becomes `node server/index.js` (after `npm run build`); `vite preview` stays for local checks.
- Tests: static serving, SPA fallback, path traversal refused, `/api/*` routed to the existing handlers.

### B2. Storage behind an interface, Postgres in production (medium)

- Each store gets a tiny storage adapter with the operations it already performs (load, upsert, append). Two implementations:
  - **file** (the current JSON code): default in development and in all existing tests, so offline dev keeps working.
  - **postgres** (`pg`): chosen when `DATABASE_URL` is set.
- Schema (one migration file, run on start):
  - `cases` (case_ref, branch_id, case_number, title, description, updated_by, updated_at) and `case_versions` (append-only history)
  - `access_requests` (id, address, requested_role, branch_id, status, decided_by, timestamps)
  - `evidence_keys` (evidence ref, wrapped key, iv, tag, master_key_version, created_by, created_at)
  - `key_access_log` (address, evidence ref, capability, result, ip hash, at): **append-only**; the app's database role gets `INSERT, SELECT` only on it
  - `sessions`, `nonces` (used by B3)
- `scripts/import-data.mjs`: copies an existing `.data/` folder into Postgres once.
- Tests: run each store's existing test suite against both adapters (Postgres in CI via a service container, free on GitHub Actions).

### B3. Persistent sign-in sessions (small)

- `server/siweAuth.js` takes a session store (memory for tests, Postgres in production) instead of its two `Map`s; expired rows are pruned on use.
- A restart or a Render spin-down no longer signs users out; sessions still end on lock, disconnect or account switch, as today.

### B4. Audit trail endpoint and event indexer (optional, medium)

Answers "who accessed or changed what" in one place, for the Auditor dashboard and PDF reports.

- Indexer inside the same process: on start and every ~30 s, reads new `EvidenceRegistered`, `CustodyRecorded`, `CaseOpened`, `IdentityAssigned` and `BranchCreated` events from the last indexed block (10-block steps on Alchemy free, or larger steps on a free public Sepolia RPC set in `INDEXER_RPC_URL`), and stores them in a `chain_events` table. Catches up after a spin-down.
- `GET /api/audit?case=…&address=…`: merges on-chain events with `key_access_log`, branch-scoped by `readScope` like the case store. Chief and Auditor only.
- The chain stays the source of truth: the UI keeps verifying against the contract; the index is a convenience and can be rebuilt from the deploy block at any time.

### B5. Verify the contract on Etherscan (tiny)

- `npx hardhat keystore set ETHERSCAN_API_KEY`, then `npx hardhat verify --network sepolia <address> <constructor args>`.
- Gives anyone readable Read/Write Contract tabs on Etherscan.

### B6. Deploy (small)

- `render.yaml` (one free web service: build `npm ci && npm run build && npm run check:bundle`, start `npm start`, health check `/`).
- Environment variables in the Render dashboard, never in the repo: `DATABASE_URL` (Neon, with `sslmode=require`), `RPC_URL`, `PINATA_JWT`, `EVIDENCE_MASTER_KEY`, `EVIDENCE_MASTER_KEY_VERSION`, plus the public `VITE_*` values.
- Neon: one project, a `main` branch for production and a `dev` branch for local testing against real Postgres.
- Manual check: walk Chief, Branch Admin, Investigator and Auditor through upload, custody transfer, verification and key release on the deployed URL.
- Update `README.md` and `docs/DEPLOY_RAILWAY.md` (rename or add `DEPLOY_RENDER.md`).

## 5. Security notes for the free setup

- **The master key is the crown jewel.** `EVIDENCE_MASTER_KEY` lives only in `.env` locally and in Render's environment settings. Keep an offline copy (password manager). Losing it makes every encrypted upload unreadable; leaking it plus the database exposes every file key.
- Wrapped keys in Neon are useless without the master key, which never goes into the database.
- Neon's free plan keeps a 6-hour restore window; add a weekly `pg_dump` (a free GitHub Actions schedule with an encrypted artifact) if the data matters.
- Everything on Sepolia is public (addresses, case ids, timestamps). Case titles and descriptions stay in Postgres for this reason; never put them on chain.
- Render's free tier puts the service on a shared host; acceptable for a project, not for real evidence (unchanged roadmap rule: not evidence-grade).

## 6. Decisions for the owner

| ID | Question | Recommendation |
| --- | --- | --- |
| BP1 | Host: Render free (simple, cold starts) or Oracle Always Free VM (always on, more setup, card needed)? | Render free |
| BP2 | Database: Neon Postgres everywhere in production, JSON files kept for local dev and tests? | Yes |
| BP3 | Build the indexer and audit endpoint (B4) now, or after deployment? | After B1 to B3 and B6 are live |
| BP4 | Keep `railway.json`, or remove it once Render works? | Remove after B6, to avoid two deploy paths |

## 7. Order and size

B1 → B2 → B3 → B6 is the path to a deployed backend; B5 can happen any time; B4 last. Each of B1, B3, B5, B6 is one small PR; B2 is one or two PRs (adapters, then schema and import).

## Sources

- Render free tier: <https://render.com/docs/free>
- Neon free plan: <https://neon.com/docs/introduction/plans>, <https://neon.com/pricing>
- Pinata free plan (third-party listing; confirm on Pinata's pricing page): <https://freetier.co/directory/products/pinata>
- Oracle Always Free (2026 changes reported by third parties): <https://terminalbytes.com/oracle-cloud-free-tier-changes-2026>
