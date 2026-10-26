# Spec 1.1: API skeleton

Phase: 1 (Backend, identity and access control). Status: **draft for owner approval.** Depends on: nothing. Blocks: 1.2, 1.3.
Roadmap decisions this relies on: D1 real product, D3 trusted operator. Open: D9 hosting, D10 language (see Open questions).

## Goal

A production-shaped HTTP API service that can be started, tested, observed and shipped, with security defaults on from the first commit. It contains **no business endpoints yet** (auth is spec 1.3, data is Phase 2). It is the foundation every later endpoint is added to.

## Context

- Today the only server code is `server/pinataProxy.js`, mounted as a Vite dev/preview middleware. It has no authentication, no database and no deployment story.
- The frontend is a Vite SPA with no backend dependency beyond `/api/pin`.
- Local machine: Node v25 (non-LTS), npm 11, **no Docker, no Postgres**. CI: Node 22 on `ubuntu-latest`.

## Design

### Stack (recommended)

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Node 22 LTS (`engines` and `.nvmrc`), TypeScript (strict) | Same LTS as CI; types for auth and crypto code reduce mistakes. |
| Framework | Fastify 5 | Built-in schema validation, structured logging (pino), mature security plugins, fast `inject()` testing. |
| Validation | zod, via a Fastify type provider | One schema validates input and types the handler. |
| Security plugins | `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cookie` | Maintained, widely used. `@fastify/cors` is deliberately **not** installed (see Same-origin). |
| Logging | pino with redaction | JSON logs, request IDs. |
| Tests | Vitest + `app.inject()` | Same runner as the frontend; no network ports needed. |

### Repository layout

An independent package (own `package.json`, own lockfile) so the API can be built and deployed without the frontend's dependencies and audited separately.

```
api/
  package.json  tsconfig.json  vitest.config.ts  .env.example  README.md
  src/
    server.ts          # reads config, builds app, listens, handles SIGTERM
    app.ts             # buildApp(config, deps) -> Fastify instance (never listens; used by tests)
    config.ts          # zod-validated environment; fails fast
    plugins/           # security.ts, errors.ts, request-id.ts, db.ts (stub until spec 1.2)
    routes/            # health.ts, v1/index.ts
  test/
```

Root `package.json` gains thin scripts (`api:dev`, `api:test`, `api:lint`, `api:typecheck`) that call `npm --prefix api ...`.

### Same-origin deployment

The SPA and the API are served from **one origin**; the API lives under `/api/v1/*` behind the same reverse proxy or edge. Consequences: no CORS, cookies can be `SameSite=Strict`, no third-party-cookie problems. In development the Vite dev server proxies `/api/v1` to the API (`server.proxy` in `vite.config.js`) so the browser still sees one origin. If hosting forces a separate API origin, this spec must be revisited first (cookie, CSRF and CSP all change).

### Configuration

All configuration is environment variables, validated at boot with zod. The process **refuses to start** with a message that names every missing or invalid variable and never prints values.

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` / `test` / `production`. |
| `PORT`, `HOST` | no | Default `8787`, `127.0.0.1`. |
| `DATABASE_URL` | yes | Runtime role (`fl_app`), see spec 1.2. |
| `WEB_ORIGIN` | yes | Exact origin of the SPA, for example `http://localhost:5173`. |
| `SIWE_DOMAIN`, `SIWE_ALLOWED_CHAIN_IDS` | spec 1.3 | Declared here so config stays in one file. |
| `SESSION_ABSOLUTE_TTL_MIN`, `SESSION_IDLE_TTL_MIN` | no | Defaults 480 and 30. |
| `TRUST_PROXY` | no | Addresses of the reverse proxies allowed to set `X-Forwarded-*` (IPs, CIDR ranges, or `loopback`/`linklocal`/`uniquelocal`); default empty = forwarded headers ignored. A bare hop count is deliberately **not** supported: it cannot verify the immediate peer, so a client reaching the API port directly could forge its IP. |
| `LOG_LEVEL` | no | Default `info`. |

No secret has a default. `.env.example` lists names with empty values only.

Validation is strict: numbers must be plain digits (`0x1F` and `1e3` are rejected), `DATABASE_URL` must have a host, user and database name, and `WEB_ORIGIN` must be an exact origin. In `production` the process additionally refuses to start unless `WEB_ORIGIN` is `https`, `LOG_LEVEL` is not `silent`, and a non-loopback database connection enables TLS (`sslmode=require|verify-ca|verify-full`). Rules that depend on other variables are checked once the individual variables are valid.

`/readyz` is unauthenticated, so it must not be a lever on the database: concurrent calls share one in-flight probe, results (including failures) are cached for 1 s, and the probe carries a database-side query timeout.

### Endpoints in this spec

| Method and path | Auth | Behaviour |
| --- | --- | --- |
| `GET /healthz` | none | Liveness. `200 {"status":"ok"}`. Touches nothing external. |
| `GET /readyz` | none | Readiness. `200` when the database answers `select 1`, else `503`. |
| `* /api/v1/*` (unknown) | none | `404` problem document. |

### Cross-cutting behaviour

- **Errors:** RFC 9457 `application/problem+json` (`type`, `title`, `status`, `detail`, `requestId`). Unexpected errors return a generic 500 with the request ID. Detail (stack traces, internal messages) is shown **only** when `NODE_ENV` is exactly `development` or `test`; any other value, including a mistyped one, gets the generic response (allowlist, not "hide in production"). Request logs must not carry query strings or other user-supplied secrets (the default Fastify request log includes the full URL).
- **Request IDs:** accept a well-formed inbound `X-Request-Id` (max 64 chars, `[A-Za-z0-9-]`), else generate a UUID; return it on every response; include it in every log line.
- **Headers:** helmet defaults plus `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` for API responses, `Strict-Transport-Security` in production, `X-Content-Type-Options: nosniff`, no `X-Powered-By`, `Cache-Control: no-store` on all `/api/v1` responses.
- **Limits:** JSON body limit 1 MiB (uploads get their own limits in Phase 2); global rate limit 100 requests/minute/IP (route-specific limits tighten this later); request timeout 30 s.
- **Logging redaction:** `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]` and request body fields named `signature`, `message`, `token`, `password` are never logged. Request and response bodies are not logged at all.
- **Shutdown:** on `SIGTERM`/`SIGINT` stop accepting connections, finish in-flight requests (10 s cap), close the database pool, exit 0.

### CI additions

A second job, `api`, in `.github/workflows/ci.yml`: Node 22, `npm ci` in `api/`, lint, typecheck, test, with a `postgres:16` service container for database tests. Plus two guards on the **whole repo**:

1. **Secret scan:** gitleaks (or equivalent) on every push and pull request.
2. **Bundle scan:** after `npm run build`, fail if `dist/` contains a JWT-shaped string (`eyJ[A-Za-z0-9_-]{10,}\.eyJ`), a PEM header (`-----BEGIN`), or any of the strings `PINATA`, `PRIVATE_KEY`, `SECRET`. This mechanizes the lesson of the leaked `VITE_` token.

## Acceptance criteria

Each item below must be covered by an automated test unless marked (manual).

1. `npm --prefix api run lint`, `typecheck` and `test` pass locally and in CI.
2. Starting with a missing or invalid variable exits non-zero with an error naming the variable and containing no value.
3. `GET /healthz` returns 200 with no database. `GET /readyz` returns 200 with a database and 503 when the database is unreachable.
4. An unknown path returns 404 `application/problem+json`; a handler that throws returns 500 with a `requestId` and **no** stack or error message in `production` mode.
5. Every response carries `X-Request-Id`, the CSP above, `nosniff`, and no `X-Powered-By`; production responses carry HSTS.
6. The 101st request within a minute from one IP returns 429 with `Retry-After`.
7. No response carries any `Access-Control-Allow-*` header, and an `OPTIONS` preflight from a foreign origin is not approved.
8. A JSON body over 1 MiB returns 413.
9. A log-capture test proves that a request with `Authorization`, `Cookie` and a body containing `signature` and `message` produces **no** log line containing those values.
10. `app.close()` closes the database pool (test with a spy) and the process exits 0 on `SIGTERM` (manual).
11. CI fails when a JWT-shaped string is planted in `dist/` and when a fake secret is committed (verify once with a throwaway branch, manual).
12. `api/README.md` explains install, run, test and environment; `.env.example` has placeholders only.

## Threats addressed

T1 key leakage (secret and bundle scans, no secrets in config defaults). Groundwork for T2, T5 and T9 (headers, same-origin, no CORS). T8 (health and readiness for the hosting platform).

## Files touched

New: everything under `api/`, `.gitleaks.toml` (if needed), `scripts/check-bundle.mjs`. Changed: `.github/workflows/ci.yml`, root `package.json` (scripts), `vite.config.js` (`/api/v1` dev proxy), `README.md` (pointer), `.gitignore` (`api/node_modules`, `api/dist`).
`server/pinataProxy.js` is **untouched** here; it is removed or moved in the last Phase 1 PR (see the index).

## Out of scope

Authentication and sessions (1.3), schema and migrations (1.2), evidence endpoints (Phase 2), container image and deployment (decided with D9), frontend CSP headers (tracked separately; the static host sets them), metrics and tracing (Phase 5).

## Open questions

- **A1.** Confirm TypeScript for the API (roadmap D10). Recommended yes. If no, the spec adapts to JavaScript with JSDoc types, and the tests become more important.
- **A2.** Confirm Fastify. Alternatives (Express, Hono) are workable; Fastify is recommended for built-in validation and logging.
- **A3.** Confirm the same-origin deployment assumption and whether the hosting platform can route `/api/v1` to the API on the same host (D9).
- **A4.** Local database method (see spec 1.2, Q-B4): needed before this spec's `readyz` and database tests run on your machine.

## Work breakdown (small PRs)

1. Scaffold `api/`, config validation, `buildApp`, health routes, tests (criteria 1-3).
2. Security plugins, problem+json errors, request IDs, rate limit, body limit, redaction (criteria 4-9).
3. CI job, secret scan, bundle scan, Vite dev proxy, docs (criteria 10-12).
