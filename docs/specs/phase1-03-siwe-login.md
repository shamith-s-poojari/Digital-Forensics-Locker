# Spec 1.3: Sign-In with Ethereum (SIWE), sessions, roles and the officer allowlist

Phase: 1. Status: **draft for owner approval.** Depends on: 1.1 (API skeleton), 1.2 (schema). Blocks: Phase 2.
Roadmap decisions this relies on: D2 law enforcement, D3 trusted operator.

## Goal

Replace the display-only MetaMask connection with real authentication and authorization:

1. A user proves control of an **allow-listed wallet** by signing a server-issued, single-use, domain-bound message (EIP-4361).
2. The server issues a short-lived **session** held in an `HttpOnly` cookie.
3. Every protected endpoint checks the session and the user's **role**.
4. Admins can manage the allowlist (who may sign in, with what role) through a minimal API.

## Context

- Today `WalletContext` reads `eth_requestAccounts` and shows an address; `Layout` gates the UI on that. Anyone with MetaMask passes. Nothing is signed, nothing is checked on a server.
- What SIWE proves: **control of a private key**. It does not prove who the person is. Identity comes from the admin who provisions the user (out of band, per agency procedure) and from key custody (hardware wallets, Q-S2).

## Design

### Roles

| Role | Meaning in Phase 1 | Later |
| --- | --- | --- |
| `admin` | Manage users and roles, revoke sessions, read audit log. | Cannot read evidence unless also a case member (Phase 2). |
| `officer` | Authenticated user who can use evidence features. | Case-scoped permissions. |
| `reviewer` | Read-only. | Read-only on assigned cases. |

Phase 1 ships the mechanism (`requireAuth`, `requireRole`); the only role-gated endpoints are the admin ones below and the session endpoints.

### Message format (EIP-4361)

```
{domain} wants you to sign in with your Ethereum account:
{address}

Sign in to Digital Forensics Locker. This does not authorize any transaction or spend any funds.

URI: {WEB_ORIGIN}
Version: 1
Chain ID: {chainId}
Nonce: {nonce}
Issued At: {issuedAt}
Expiration Time: {issuedAt + 5 minutes}
```

The statement is fixed text, so a wallet that renders the message shows the same wording every time.

### Endpoints

All under `/api/v1/auth`. All responses `Cache-Control: no-store`.

| Method and path | Auth | Request | Success | Failure |
| --- | --- | --- | --- | --- |
| `POST /nonce` | none | none | `200 { nonce, expiresAt }` | `429` |
| `POST /verify` | none | `{ message: string, signature: 0x-hex }` | `200 { user, session }` + `Set-Cookie` | `400` malformed body; `401` **one uniform error** for every verification failure; `429` |
| `GET /session` | cookie | none | `200 { user, session }` | `401` |
| `POST /logout` | cookie | none | `204` + cookie cleared, session revoked | `401` |

`user` = `{ id, address (EIP-55), displayName, role }`; `session` = `{ expiresAt, idleTimeoutSeconds }`.

Admin endpoints under `/api/v1/admin` (`admin` role only; each action audited):

| Method and path | Behaviour |
| --- | --- |
| `GET /users` | List users (paginated). |
| `POST /users` | Create `{ address, displayName, agencyId?, role }` with status `active`. Rejects duplicates. |
| `PATCH /users/:id` | Change `displayName`, `agencyId`, `role`, `status`. An admin cannot demote or suspend **themselves** or the **last active admin**. |
| `POST /users/:id/revoke-sessions` | Revoke all of a user's sessions. |
| `GET /audit` | Read audit entries (filters: actor, action, time range; paginated). |

### Verification algorithm (`POST /verify`)

Fail closed. Every failure returns the same `401` problem (`Sign-in failed`) so the endpoint is not an oracle for "is this address allow-listed?" or "which check failed?". The **specific reason** goes only into the audit log (`details.reason`) as an enumerated code.

1. Body schema: `message` at most 2 KB, `signature` is `0x` + 130 hex.
2. Parse the message with the `siwe` library; reject anything non-canonical.
3. `domain` equals `SIWE_DOMAIN` **exactly**; `uri` origin equals `WEB_ORIGIN`. (This defeats phishing sites: a message signed for another domain is useless here.)
4. Time window: `issuedAt` not more than 60 s in the future and not older than 5 min; `expirationTime` in the future; `notBefore` (if present) in the past.
5. `chainId` is in `SIWE_ALLOWED_CHAIN_IDS`.
6. Recover the signer from the signature (EIP-191 `personal_sign`); it must equal `message.address`. Contract wallets (EIP-1271) are out of scope (Q-S3).
7. **Consume the nonce atomically:** `UPDATE auth_nonces SET consumed_at = now() WHERE nonce = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING ...`. Zero rows means replay, unknown or expired: fail. Two concurrent requests with the same message: exactly one succeeds.
8. Look up `users` by lowercase address with `status = 'active'`. Not found or not active: fail.
9. Create a session (below), set `last_login_at`, write the `auth.login` audit row, set the cookie.

Failure throttling: after **5 failed verifies for the same claimed address, or 10 from the same IP, within 15 minutes** (counted from `audit_log`, so it is consistent across API instances), further attempts return `429` until the window passes. Throttle events are audited.

### Sessions and cookie

- Token: 32 random bytes (`crypto.randomBytes`), base64url in the cookie. The database stores only **SHA-256(token)**, so a database leak yields no usable tokens.
- Cookie: `__Host-fl_session`; `Path=/`; `Secure`; `HttpOnly`; `SameSite=Strict`; **no `Domain`**. In `development` over plain `http://localhost` the name is `fl_session` and `Secure` is omitted (Safari rejects `Secure` on `http://localhost`); production always uses the `__Host-` form.
- Lifetimes (configurable, Q-S1): absolute 8 h, idle 30 min. `last_seen_at` is updated at most once per minute.
- A new session is created on every login (no fixation). Logging in does not reuse or extend an old session.
- On every authenticated request the lookup joins `users` and requires: token hash matches, not revoked, not expired (absolute and idle), **user status still `active`**. Suspending a user therefore ends their access on the next request.

### CSRF defence in depth

`SameSite=Strict` is the primary control. In addition, every non-`GET`/`HEAD`/`OPTIONS` request must have an `Origin` header equal to `WEB_ORIGIN` **and** the header `X-Requested-With: forensics-locker`; otherwise `403` (audited as `authz.denied`).

### Authorization helpers

`requireAuth` (attaches `request.user`, `401` otherwise) and `requireRole(...roles)` (`403` otherwise, audited). Failing closed is the default: a route with no declared policy is rejected by a test that enumerates all registered routes and requires each to declare `public` or an auth policy.

### Frontend

- Replace the display-only wallet state with an **auth state machine**: `disconnected → connected (account known) → signing → authenticated`, with `error` reachable from any step. Exposed through the existing `WalletContext`/`useWallet` module pair (extend, do not duplicate) plus a new `src/utils/api.js`.
- `api.js`: same-origin `fetch`, always sends `X-Requested-With: forensics-locker`, parses problem+json, and on a `401` from any call clears local auth state.
- `Layout` gates content on `authenticated`, not on `account`. The restricted screen offers "Connect wallet" then "Sign in"; a `401` shows a generic "This wallet is not authorized" message.
- On load, call `GET /session` to restore the session.
- If MetaMask's selected account changes and differs from `session.user.address`, sign out locally and on the server and require a new signature.
- The client builds the message with the `siwe` package (ethers v6 as its dependency) using the nonce from the server and `window.location.host` as the domain.
- `DemoBanner` stays until the end of Phase 5.

## Acceptance criteria

API tests use real signatures (ethers `Wallet.createRandom()`) against `buildApp` and a real test database.

**Login correctness**
1. A valid message, signed by an allow-listed active user, returns 200 and sets a cookie with the exact flags above; `GET /session` then returns that user.
2. Rejected with the **same** 401 body (and an audit row with a distinct `details.reason`): wrong signer; message edited after signing; wrong `domain`; wrong `uri`; disallowed `chainId`; expired message; `issuedAt` in the future or too old; unknown address; `invited` or `suspended` user.
3. A nonce cannot be reused: replaying a previously successful `{message, signature}` fails; two concurrent requests with the same pair yield exactly one 200.
4. An expired nonce fails; a nonce never issued fails.
5. The 401 responses for "unknown address" and "bad signature" are byte-identical apart from `requestId`.
6. Throttling: the 6th failed attempt for one address within 15 minutes returns 429.

**Sessions**
7. The database never contains the raw token (assert by hashing the cookie value and finding that hash only).
8. `logout` revokes the session: the old cookie then gets 401. Absolute and idle expiry are enforced (fake timers). Suspending the user via the admin API makes the next request fail.
9. Logging in twice creates two sessions with different tokens.

**CSRF and headers**
10. A state-changing request without the custom header or with a foreign `Origin` returns 403 even with a valid cookie.

**Authorization**
11. Every admin endpoint returns 401 unauthenticated and 403 for `officer` and `reviewer`.
12. An admin cannot demote, suspend or revoke themselves into zero active admins; the attempt returns 409 and nothing changes.
13. Every admin write produces an audit row with the correct actor, action and target.
14. The route-policy test (no route lacks a declared policy) passes.

**Frontend** (component tests with a mocked `window.ethereum` and mocked `fetch`)
15. The flow connect → nonce → sign → verify reaches `authenticated`; the signed message contains the server nonce and the configured domain.
16. A rejected wallet prompt (error code 4001) shows a friendly message and stays `connected`.
17. A `401` from verify shows the generic unauthorized message and does not reveal why.
18. Switching MetaMask accounts while authenticated signs the user out.
19. After a page reload with a valid cookie, the UI restores `authenticated` without a signature prompt.
20. The production bundle contains no secret (the bundle scan from spec 1.1 still passes).

## Threats addressed

T2 forged submitter identity (signature plus allowlist), T5 replay (single-use nonce, expiry, domain binding), part of T9 (cookie `HttpOnly`, no token in JavaScript, CSRF checks).
**Residual risks:** a stolen or malware-held wallet key (mitigate with hardware wallets, Q-S2); an admin account compromise (mitigate with at least two admins, audit review, Phase 5 alerting); phishing of a user into signing a message for the real domain (the fixed statement and wallet display help; training covers the rest).

## Files touched

New: `api/src/routes/v1/auth.ts`, `.../admin.ts`, `api/src/auth/{siwe,session,policy}.ts`, `api/test/auth/*`, `src/utils/api.js`, `src/context/authReducer.js` (state machine) with tests. Changed: `src/context/WalletContext.jsx`, `src/context/walletContext.js`, `src/components/Layout.jsx`, `src/components/WalletConnect.jsx`, `api/.env.example`, both `package.json` files (`siwe`, `ethers`).

## Out of scope

Evidence and case endpoints, per-case authorization (Phase 2), an admin user interface (the API is enough for Phase 1; a screen comes later), EIP-1271 contract wallets, multi-factor beyond a hardware wallet, single sign-on with an agency identity provider (revisit with D9), automated alerting (Phase 5).

## Open questions

- **S1. Session lifetimes:** default 8 h absolute and 30 min idle. Does agency policy require something different?
- **S2. Hardware wallets:** require officers to use a hardware wallet (Ledger/Trezor via MetaMask)? Recommended for production; the code is the same, it is a provisioning policy.
- **S3. Contract wallets (EIP-1271, such as Safe):** needed? Recommended no for Phase 1.
- **S4. Allowed chain IDs for login:** the chain only scopes the signed message. Recommended `11155111` (Sepolia) for development and staging, and the production value chosen with roadmap D6.
- **S5. Provisioning workflow:** who verifies a person's identity before an admin adds their address, and where is that recorded? Recommended: agency procedure, with the verifier's name in `agency_id`/audit `details`.
- **S6. Account recovery:** if an officer loses their key, an admin suspends the old address and creates a new user entry. Confirm this is acceptable; there is deliberately no self-service recovery.

## Work breakdown (small PRs)

1. Server: nonce and verify with SIWE, sessions, cookie, CSRF check, throttling (criteria 1-10).
2. Server: `requireAuth`/`requireRole`, admin endpoints, audit, route-policy test (criteria 11-14).
3. Frontend: `api.js`, auth state machine, `Layout` gating, restore-on-load (criteria 15-20).
