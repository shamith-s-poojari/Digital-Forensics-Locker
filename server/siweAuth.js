// Server-side Sign-In with Ethereum (EIP-4361): nonce issue, signature check and session cookie.
//
// Endpoints (Node http handlers, mounted on the Vite dev/preview servers by vite.config.js):
//   GET  /api/auth/nonce    -> { nonce }                       single use, expires after NONCE_TTL_MS
//   POST /api/auth/verify   { message, signature } -> session  sets an httpOnly cookie
//   GET  /api/auth/session  -> { address, chainId, expiresAt } or 401
//   POST /api/auth/logout   -> 204                             deletes the session and the cookie
//
// What a session proves: the holder of the cookie signed, within the last SESSION_TTL_MS, a fresh server nonce with
// the private key of `address`. It grants nothing by itself. Roles stay on chain, and the contract checks them on
// every write.
//
// LIMITS: nonces and sessions live in memory, so a server restart signs everyone out, and this does not scale past
// one process. A deployed API needs a shared store (roadmap Phase 1, `sessions` table).

import { randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { parseSiweMessage } from "../src/auth/siweMessage.js";
import { REQUIRED_HEADER_VALUE } from "./pinataProxy.js";

export const SESSION_COOKIE = "dfl_session";
export const NONCE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;
const MAX_PENDING_NONCES = 10_000;
const MAX_SESSIONS = 10_000;
const MAX_BODY_BYTES = 4 * 1024;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > limit) {
        reject(Object.assign(new Error("Request body too large"), { code: "TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

/** Same rule as the pin proxy: a custom header (forces a CORS preflight cross-site) and a same-host Origin. */
export function isSameSiteRequest(req) {
  if (req.headers["x-requested-with"] !== REQUIRED_HEADER_VALUE) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Drops expired entries; Map iteration is in insertion order, which is also expiry order here. */
function pruneExpired(map, now) {
  for (const [key, entry] of map) {
    if (entry.expiresAt > now) break;
    map.delete(key);
  }
}

/**
 * @param {object} [options]
 * @param {() => number} [options.now]       Clock (ms). Injected by tests.
 * @param {number} [options.chainId]         When set, only sign-ins for this chain are accepted.
 * @param {boolean} [options.secureCookie]   Add `Secure` to the cookie (any HTTPS deployment).
 */
export function createSiweAuth({ now = Date.now, chainId, secureCookie = false } = {}) {
  /** nonce -> { expiresAt } */
  const nonces = new Map();
  /** session id -> { address, chainId, expiresAt } */
  const sessions = new Map();

  const cookie = (value, maxAgeSeconds) =>
    `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAgeSeconds}${secureCookie ? "; Secure" : ""}`;

  /** The live session for this request, or null. */
  function getSession(req) {
    const id = readCookie(req, SESSION_COOKIE);
    if (!id) return null;
    const session = sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= now()) {
      sessions.delete(id);
      return null;
    }
    return { id, ...session };
  }

  function issueNonce(res) {
    const time = now();
    pruneExpired(nonces, time);
    if (nonces.size >= MAX_PENDING_NONCES) return sendJson(res, 503, { error: "Too many pending sign-ins. Try again shortly." });
    const nonce = randomBytes(16).toString("hex");
    nonces.set(nonce, { expiresAt: time + NONCE_TTL_MS });
    return sendJson(res, 200, { nonce });
  }

  async function verify(req, res) {
    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
    } catch (err) {
      return sendJson(res, err?.code === "TOO_LARGE" ? 413 : 400, { error: "Expected a JSON body with `message` and `signature`." });
    }

    const reject = (reason) => sendJson(res, 401, { error: `Sign-in rejected: ${reason}` });
    const fields = parseSiweMessage(body?.message);
    if (!fields) return reject("the message is not in the expected format.");
    if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) return reject("the signature is malformed.");

    // Consume the nonce before any other check, so a message is never accepted twice, even after a failed attempt.
    const pending = nonces.get(fields.nonce);
    nonces.delete(fields.nonce);
    const time = now();
    if (!pending || pending.expiresAt <= time) return reject("the sign-in request expired or was already used. Try again.");

    if (fields.domain !== req.headers.host) return reject("the message was made for a different site.");
    let uriHost = null;
    try {
      uriHost = new URL(fields.uri).host;
    } catch {
      /* handled below */
    }
    if (uriHost !== req.headers.host) return reject("the message was made for a different site.");
    if (chainId !== undefined && fields.chainId !== chainId) return reject(`the wallet is on chain ${fields.chainId}, expected ${chainId}.`);

    const issuedAt = Date.parse(fields.issuedAt);
    const expiresAt = Date.parse(fields.expirationTime);
    if (!(issuedAt <= time + CLOCK_SKEW_MS) || !(issuedAt >= time - NONCE_TTL_MS - CLOCK_SKEW_MS)) return reject("the message's time is out of range. Check your computer's clock.");
    if (!(expiresAt > time)) return reject("the message has expired.");

    let signer;
    try {
      signer = verifyMessage(body.message, body.signature);
    } catch {
      return reject("the signature could not be checked.");
    }
    if (getAddress(signer) !== getAddress(fields.address)) return reject("the signature does not belong to the address in the message.");

    pruneExpired(sessions, time);
    if (sessions.size >= MAX_SESSIONS) return sendJson(res, 503, { error: "Too many active sessions. Try again later." });

    // Replace this browser's previous session, if any, so switching accounts never leaves two live sessions.
    const previous = getSession(req);
    if (previous) sessions.delete(previous.id);

    const id = randomBytes(32).toString("base64url");
    const session = { address: getAddress(fields.address), chainId: fields.chainId, expiresAt: time + SESSION_TTL_MS };
    sessions.set(id, session);
    res.setHeader("Set-Cookie", cookie(id, Math.floor(SESSION_TTL_MS / 1000)));
    return sendJson(res, 200, session);
  }

  function logout(req, res) {
    const session = getSession(req);
    if (session) sessions.delete(session.id);
    res.setHeader("Set-Cookie", cookie("", 0));
    res.statusCode = 204;
    res.setHeader("Cache-Control", "no-store");
    res.end();
  }

  /**
   * Routes /api/auth/* requests. Returns false (without responding) for any other path.
   *
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async function handle(req, res) {
    const path = req.url?.split("?")[0];
    if (!path?.startsWith("/api/auth/")) return false;

    const route = `${req.method} ${path}`;
    if (route !== "GET /api/auth/session" && !isSameSiteRequest(req)) {
      sendJson(res, 403, { error: "Request rejected." });
      return true;
    }

    switch (route) {
      case "GET /api/auth/nonce":
        issueNonce(res);
        break;
      case "POST /api/auth/verify":
        await verify(req, res);
        break;
      case "GET /api/auth/session": {
        const session = getSession(req);
        if (session) sendJson(res, 200, { address: session.address, chainId: session.chainId, expiresAt: session.expiresAt });
        else sendJson(res, 401, { error: "Not signed in." });
        break;
      }
      case "POST /api/auth/logout":
        logout(req, res);
        break;
      default:
        sendJson(res, 404, { error: "Not found." });
    }
    return true;
  }

  return { handle, getSession };
}
