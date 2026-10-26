// Server-side store for per-file evidence decryption keys (envelope encryption, roadmap decision D4).
//
// The browser encrypts each file with its own random key (src/crypto/evidenceCrypto.js) and sends that key here
// before the encrypted copy is pinned. The key is wrapped (encrypted) with the agency master key and only the wrapped
// form is written to disk. Endpoints (mounted by vite.config.js, both need a wallet sign-in session):
//
//   POST /api/keys        { keyId, sha256, key }  -> 201   stores a key once; an id can never be overwritten
//   GET  /api/keys/:keyId                         -> { keyId, sha256, key, createdBy, createdAt }
//
// Wrapping: AES-256-GCM under the master key, with the key id, plaintext SHA-256 and master-key version as additional
// data, so a stored entry cannot be moved onto another key id or file. `masterKeyVersion` is stored with each entry so
// the master key can be rotated later.
//
// Every key release is appended to an access log (who, which key, when).
//
// LIMITS (development build): the master key comes from an environment variable rather than a KMS/HSM; any signed-in
// wallet may read any key (the server does not yet check on-chain roles); the store is a JSON file for one process.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isSameSiteRequest } from "./siweAuth.js";

const KEY_ID = /^[0-9a-f]{32}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 2 * 1024;

export const MASTER_KEY_HELP =
  "Set EVIDENCE_MASTER_KEY in .env to 32 random bytes in base64 (node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\") and restart the dev server.";

/** Decodes the master key from base64. Returns null unless it is exactly 32 bytes. */
export function parseMasterKey(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = Buffer.from(value.trim(), "base64");
  return key.length === 32 ? key : null;
}

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

const additionalData = (version, keyId, sha256) => Buffer.from(`dfl-evidence-key|v${version}|${keyId}|${sha256}`, "utf8");

function wrapKey(masterKey, version, keyId, sha256, rawKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  cipher.setAAD(additionalData(version, keyId, sha256));
  const wrapped = Buffer.concat([cipher.update(rawKey), cipher.final()]);
  return { iv: iv.toString("base64"), wrapped: wrapped.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function unwrapKey(masterKey, entry) {
  const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(entry.iv, "base64"));
  decipher.setAAD(additionalData(entry.masterKeyVersion, entry.keyId, entry.sha256));
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(entry.wrapped, "base64")), decipher.final()]);
}

/**
 * @param {object} options
 * @param {Buffer | null} options.masterKey        32 bytes, or null (then every request gets 503 with setup help).
 * @param {number} [options.masterKeyVersion]
 * @param {string} options.filePath                JSON file holding the wrapped keys.
 * @param {string} options.accessLogPath           JSON-lines file; one line per key release.
 * @param {(req) => ({ address: string } | null)} options.getSession  From server/siweAuth.js.
 * @param {() => number} [options.now]
 */
export function createKeyStore({ masterKey, masterKeyVersion = 1, filePath, accessLogPath, getSession, now = Date.now }) {
  /** @type {Promise<Map<string, object>> | null} */
  let loading = null;
  // Writes are chained so two uploads at once cannot interleave and lose an entry.
  let writeChain = Promise.resolve();

  function entries() {
    loading ??= readFile(filePath, "utf8")
      .then((text) => new Map(Object.entries(JSON.parse(text).keys ?? {})))
      .catch((err) => {
        if (err?.code === "ENOENT") return new Map();
        loading = null; // a corrupt or unreadable file must not be silently replaced by an empty store
        throw err;
      });
    return loading;
  }

  function persist(map) {
    writeChain = writeChain.then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ version: 1, keys: Object.fromEntries(map) }, null, 2), { mode: 0o600 });
      await rename(tmp, filePath);
    });
    return writeChain;
  }

  async function store(req, res, session) {
    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
    } catch (err) {
      return sendJson(res, err?.code === "TOO_LARGE" ? 413 : 400, { error: "Expected a JSON body with keyId, sha256 and key." });
    }
    const keyId = String(body?.keyId ?? "");
    const sha256 = String(body?.sha256 ?? "");
    const rawKey = typeof body?.key === "string" ? Buffer.from(body.key, "base64") : Buffer.alloc(0);
    if (!KEY_ID.test(keyId) || !SHA256.test(sha256) || rawKey.length !== 32) {
      return sendJson(res, 400, { error: "Expected keyId (32 hex), sha256 (64 hex) and a 32-byte base64 key." });
    }

    const map = await entries();
    if (map.has(keyId)) return sendJson(res, 409, { error: "A key with this id is already stored. Keys are never replaced." });

    const entry = {
      keyId,
      sha256,
      masterKeyVersion,
      ...wrapKey(masterKey, masterKeyVersion, keyId, sha256, rawKey),
      createdBy: session.address,
      createdAt: new Date(now()).toISOString(),
    };
    rawKey.fill(0);
    map.set(keyId, entry);
    try {
      await persist(map);
    } catch (err) {
      map.delete(keyId);
      throw err;
    }
    return sendJson(res, 201, { keyId, sha256, masterKeyVersion });
  }

  async function release(res, session, keyId) {
    if (!KEY_ID.test(keyId)) return sendJson(res, 400, { error: "Malformed key id." });
    const entry = (await entries()).get(keyId);
    if (!entry) return sendJson(res, 404, { error: "No key is stored for this file." });
    if (entry.masterKeyVersion !== masterKeyVersion) {
      return sendJson(res, 503, { error: `This key is wrapped with master key version ${entry.masterKeyVersion}, which is not loaded.` });
    }

    let rawKey;
    try {
      rawKey = unwrapKey(masterKey, entry);
    } catch {
      return sendJson(res, 500, { error: "The stored key could not be unwrapped (wrong master key, or the store was modified)." });
    }
    // Log before releasing: a key never leaves without a record of who took it.
    await mkdir(dirname(accessLogPath), { recursive: true });
    await appendFile(accessLogPath, `${JSON.stringify({ keyId, sha256: entry.sha256, address: session.address, at: new Date(now()).toISOString() })}\n`, { mode: 0o600 });
    const body = { keyId, sha256: entry.sha256, key: rawKey.toString("base64"), createdBy: entry.createdBy, createdAt: entry.createdAt };
    rawKey.fill(0);
    return sendJson(res, 200, body);
  }

  /**
   * Routes /api/keys requests. Returns false (without responding) for any other path.
   *
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async function handle(req, res) {
    const path = req.url?.split("?")[0] ?? "";
    if (path !== "/api/keys" && !path.startsWith("/api/keys/")) return false;

    if (!isSameSiteRequest(req)) {
      sendJson(res, 403, { error: "Request rejected." });
      return true;
    }
    if (!masterKey) {
      sendJson(res, 503, { error: `Evidence encryption is not configured on the server. ${MASTER_KEY_HELP}` });
      return true;
    }
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "Sign in with your wallet first." });
      return true;
    }

    if (req.method === "POST" && path === "/api/keys") await store(req, res, session);
    else if (req.method === "GET" && path.startsWith("/api/keys/")) await release(res, session, path.slice("/api/keys/".length));
    else sendJson(res, 405, { error: "Method not allowed." });
    return true;
  }

  return { handle };
}
