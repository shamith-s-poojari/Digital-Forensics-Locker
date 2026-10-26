# Forensics Locker API

HTTP API for Digital Forensics Locker. This is the Phase 1 skeleton: configuration, health probes and the app factory. Business endpoints arrive in later pull requests (see [`docs/specs/`](../docs/specs/README.md)). It is a separate package with its own `package.json` and lockfile.

Requires Node.js 22 or newer (CI uses 22; `.nvmrc` pins it).

## Run it

```bash
cd api
npm install
cp .env.example .env     # then fill in DATABASE_URL (see below)
npm run dev              # tsx watch, listens on 127.0.0.1:8787
```

From the repository root the same scripts are available as `npm run api:dev`, `api:test`, `api:lint` and `api:typecheck`. In development the web app's Vite server forwards `/api/v1/*` to this process, so the browser sees one origin.

`DATABASE_URL` must point at a PostgreSQL 16 database. Until spec 1.2 lands only `/readyz` uses it: with no database, `/healthz` still returns 200 and `/readyz` returns 503, which is the intended behaviour.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with file watching (loads `.env` if present). |
| `npm run build` | Compile to `dist/` (`tsc`). |
| `npm start` | Run the compiled server. |
| `npm run typecheck` | Type-check without emitting. |
| `npm run lint` | ESLint with type-aware rules (floating promises are errors). |
| `npm test` | Vitest, using `app.inject()`, so no ports are opened. The startup tests spawn the real entry point to prove bad configuration stops the process. |

## Configuration

All configuration is environment variables, validated at boot with zod (`src/config.ts`). On any problem the process exits with status 1 and a message that names each bad variable but **never prints its value**. No secret has a default. See `.env.example` for the full list.

## Endpoints

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /healthz` | none | Liveness. Always 200 while the process runs; touches nothing external. |
| `GET /readyz` | none | Readiness. 200 if the database answers `select 1` within 2 s, otherwise 503 with no detail. |

## Layout

```
src/
  server.ts        process entry: config, listen, graceful shutdown (SIGTERM/SIGINT, 10 s cap)
  app.ts           buildApp(config, deps, options): the Fastify instance, never listens
  config.ts        environment schema and ConfigError
  db.ts            minimal Db interface and the pg pool
  routes/health.ts liveness and readiness
test/              config, health, trust-proxy and startup tests
```

## Notes

- `TRUST_PROXY` lists the addresses of the reverse proxies allowed to set `X-Forwarded-*` headers (IPs, CIDR ranges, or `loopback` / `linklocal` / `uniquelocal`). Empty means forwarded headers are ignored. The client address is the first one, from the right, that is not a listed proxy, so a client cannot invent extra hops. Keep the API port reachable only through those proxies; otherwise per-IP rate limiting (spec 1.1, PR 2) and audit IPs can be forged.
- In `production` the process also refuses to start unless `WEB_ORIGIN` is `https`, logging is not `silent`, and a non-local database connection enables TLS (`sslmode=verify-full`).
- `/readyz` is unauthenticated, so concurrent calls share one database probe and the result is cached for 1 s.
- Security headers, problem+json errors, request IDs, rate limiting and log redaction are the next pull request.
