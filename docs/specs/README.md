# Phase 1 specs: index

Phase 1 turns the demo into a system that knows who is calling. Three specs, built in order, each as a few small pull requests following the process loop in [`../ROADMAP.md`](../ROADMAP.md) (spec, decision check, tests first, CI, human review, staging, merge).

| Spec | Subject | Depends on |
| --- | --- | --- |
| [1.1 API skeleton](phase1-01-api-skeleton.md) | Fastify/TypeScript service, config, errors, headers, CI, secret and bundle scans | none |
| [1.2 Database schema](phase1-02-database-schema.md) | PostgreSQL, migrations, least-privilege roles, append-only audit log | 1.1 |
| [1.3 SIWE login](phase1-03-siwe-login.md) | Wallet-signature login, sessions, roles, allowlist, admin API, frontend auth | 1.1, 1.2 |

## Build order (PR plan)

| PR | Content | Spec criteria |
| --- | --- | --- |
| 1 | `api/` scaffold, config validation, `buildApp`, health routes | 1.1 #1-3 |
| 2 | Security plugins, problem+json, request IDs, rate/body limits, log redaction | 1.1 #4-9 |
| 3 | CI `api` job, secret scan, bundle scan, Vite `/api/v1` dev proxy, docs | 1.1 #10-12 |
| 4 | Migrations `0001`, database roles, privilege tests, audit helper | 1.2 #1-6, 9 |
| 5 | `bootstrap-admin`, `db:seed`, cleanup job, `docs/database.md` | 1.2 #7, 8, 10, 11 |
| 6 | SIWE nonce and verify, sessions, cookie, CSRF check, throttling | 1.3 #1-10 |
| 7 | `requireAuth`/`requireRole`, admin endpoints, audit reads, route-policy test | 1.3 #11-14 |
| 8 | Frontend: `api.js`, auth state machine, Layout gating, restore on load | 1.3 #15-20 |
| 9 | Retire `server/pinataProxy.js` and the Vite middleware (see below) | Phase 1 exit |

PR 9 depends on roadmap decision **D7** (where evidence bytes are stored). If Pinata is dropped for police data, delete the proxy, the `/api/pin` route, `src/utils/ipfs.js` and the upload button outright. If it stays for now, re-implement `/api/pin` in the API behind `requireAuth` with per-user limits, then delete the Vite middleware. Either way the unauthenticated proxy must be gone before Phase 1 exits.

## Phase 1 exit criteria (from the roadmap, made testable)

- Unauthenticated calls to every data and admin endpoint fail (route-policy test).
- A forged, edited, wrong-domain, expired or replayed login signature is rejected (spec 1.3 #2-4).
- The unauthenticated Vite proxy is gone (PR 9).
- No secret is reachable from the browser: bundle scan green in CI.
- `audit_log` cannot be modified by the application role or by the owner role (spec 1.2 #4-5).

## Questions to answer before PR 1

Each has a recommended default. Replying "accept defaults" is a valid answer.

| # | Question | Recommended default | Needed by |
| --- | --- | --- | --- |
| A1 | TypeScript for the API (roadmap D10)? | Yes | PR 1 |
| A2 | Fastify as the framework? | Yes | PR 1 |
| A3 | SPA and API served from one origin (`/api/v1` on the same host)? | Yes | PR 1 |
| B4 | How to get PostgreSQL on your Windows machine (no Docker, no Postgres found)? | Native PostgreSQL 16 install (`winget install PostgreSQL.PostgreSQL.16`) | PR 4 (tests); PR 1 can start without |
| B1 | Per-case need-to-know access (introduced in Phase 2) rather than global roles only? | Yes, per-case | PR 4 (shapes roles) |
| B2 | Create only Phase-1 tables now, defer cases/evidence/custody tables? | Yes, defer | PR 4 |
| B3 | Kysely as the query layer? | Yes | PR 4 |
| B5 | Store an `agency_id` (badge/employee number); any other identity fields? | `agency_id` only | PR 4 |
| S1 | Session lifetimes 8 h absolute, 30 min idle? | Yes, until agency policy says otherwise | PR 6 |
| S2 | Require hardware wallets for officers in production? | Yes (provisioning policy) | Phase 6 |
| S3 | Support contract wallets (EIP-1271)? | No | PR 6 |
| S4 | Allowed login chain IDs? | Sepolia `11155111` for dev and staging; production with D6 | PR 6 |
| S5 | Who verifies identity before an admin adds a user, and where is it recorded? | Agency procedure; verifier named in the audit entry | before go-live |
| S6 | Lost key means an admin suspends the old address and creates a new user (no self-service recovery)? | Yes | PR 7 |

Still open from the roadmap and not blocking Phase 1: D6 (which chain and timestamp authority), D7 (evidence storage), D8 (retention), D9 (hosting and budget), and the country/jurisdiction under D2.
