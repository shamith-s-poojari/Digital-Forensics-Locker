// Server-side store for per-file evidence decryption keys (envelope encryption, roadmap decision D4).
//
// The browser encrypts each file with its own random key (src/crypto/evidenceCrypto.js) and sends that key here
// before the encrypted copy is pinned. The key is wrapped (encrypted) with the agency master key and only the wrapped
// form is stored. Endpoints (mounted by vite.config.js, both need a wallet sign-in session and a role):
//
//   POST /api/keys        { keyId, sha256, key }  -> 201   stores a key once; an id can never be overwritten
//   GET  /api/keys/:keyId?evidence=<id>           -> { keyId, sha256, key, createdBy, createdAt }
//   GET  /api/keys/releases?evidence=<id>[&sha256=] -> { releases: [{ address, at }] }  who decrypted this evidence
//
// Binding a release to the ledger: with a contract configured, a key is released only for a named evidence record
// that exists on chain, whose registered SHA-256 is the one stored with the key, and whose branch the caller may see
// (the Chief sees every branch). So holding a role is not enough to open evidence from another branch, and a key id
// cannot be asked for without saying which evidence record it is for. The release log names the evidence record.
//
// Wrapping: AES-256-GCM under the master key, with the key id, plaintext SHA-256 and master-key version as additional
// data, so a stored entry cannot be moved onto another key id or file. `masterKeyVersion` is stored with each entry so
// the master key can be rotated later.
//
// Every key release is appended to an access log (who, which key, when).
//
// Roles (server/chainRoles.js, via `checkRole`): storing a key needs the upload capability (Investigator); releasing
// one needs the view capability (any role on the ledger).
//
// LIMITS (development build): the master key comes from an environment variable rather than a KMS/HSM; within a
// branch, any wallet with a role may read any of that branch's keys (there is no per-case access list); the release
// log is kept by this server, not on the ledger (the contract lets only Investigators write custody entries).
//
// Storage: server/storage/ (JSON files in development, Postgres when DATABASE_URL is set).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { CAPABILITIES } from "../src/web3/roles.js";
import { allowAll, globalScope } from "./chainRoles.js";
import { isSameSiteRequest } from "./siweAuth.js";

const KEY_ID = /^[0-9a-f]{32}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const EVIDENCE_ID = /^[1-9][0-9]{0,15}$/;
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
 * @param {object} options.storage                 The `keys` part of a storage (server/storage/fileStorage.js).
 * @param {(req) => ({ address: string } | null)} options.getSession  From server/siweAuth.js.
 * @param {(session, capability: string) => Promise<null | { status: number, error: string }>} [options.checkRole]
 *        From server/chainRoles.js. Defaults to no role checks.
 * @param {(session) => Promise<{ global: boolean, branchId: number | null }>} [options.readScope]
 *        From server/chainRoles.js. Defaults to every branch.
 * @param {((id: number) => Promise<{ sha256: string, branchId: number } | null>) | null} [options.readEvidence]
 *        Reads an evidence record from the contract (chainRoles.js createChainEvidenceReader). null when no contract
 *        is configured (the dev server's demo ledger lives in the browser): releases are then not bound to a record.
 * @param {() => number} [options.now]
 */
export function createKeyStore({ masterKey, masterKeyVersion = 1, storage, getSession, checkRole = allowAll, readScope = globalScope, readEvidence = null, now = Date.now }) {
  /**
   * The evidence record a request names (?evidence=<id>), checked against the ledger and the caller's branch.
   * Resolves to { evidenceId, sha256 } (sha256 null without a contract), or { error: [status, message] }.
   */
  async function evidenceFor(req, session) {
    const params = new URL(req.url ?? "", "http://x").searchParams;
    const raw = params.get("evidence");
    if (raw === null) {
      if (readEvidence) return { error: [400, "Say which evidence record the key is for (?evidence=<id>)."] };
      return { evidenceId: null, sha256: null };
    }
    if (!EVIDENCE_ID.test(raw)) return { error: [400, "Malformed evidence id."] };
    const evidenceId = Number(raw);
    if (!readEvidence) return { evidenceId, sha256: null };

    let record;
    try {
      record = await readEvidence(evidenceId);
    } catch {
      return { error: [503, "Could not read the evidence record from the ledger. Try again shortly."] };
    }
    if (!record) return { error: [404, `Evidence #${evidenceId} is not on the ledger.`] };
    const scope = await readScope(session);
    if (!scope.global && scope.branchId !== record.branchId) {
      return { error: [403, `Evidence #${evidenceId} belongs to another branch. Your role does not cover it.`] };
    }
    return { evidenceId, sha256: record.sha256 };
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

    const entry = {
      keyId,
      sha256,
      masterKeyVersion,
      ...wrapKey(masterKey, masterKeyVersion, keyId, sha256, rawKey),
      createdBy: session.address,
      createdAt: new Date(now()).toISOString(),
    };
    rawKey.fill(0);
    if (!(await storage.insert(entry))) return sendJson(res, 409, { error: "A key with this id is already stored. Keys are never replaced." });
    return sendJson(res, 201, { keyId, sha256, masterKeyVersion });
  }

  async function release(req, res, session, keyId) {
    if (!KEY_ID.test(keyId)) return sendJson(res, 400, { error: "Malformed key id." });
    const evidence = await evidenceFor(req, session);
    if (evidence.error) return sendJson(res, evidence.error[0], { error: evidence.error[1] });
    const entry = await storage.get(keyId);
    if (!entry) return sendJson(res, 404, { error: "No key is stored for this file." });
    // The key must be the one escrowed for this record's file, or a key for one branch's file could be released
    // by naming another branch's record.
    if (evidence.sha256 && evidence.sha256 !== entry.sha256) {
      return sendJson(res, 409, { error: `This file's key does not belong to evidence #${evidence.evidenceId}: the hashes differ.` });
    }
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
    await storage.logRelease({
      keyId,
      sha256: entry.sha256,
      address: session.address,
      at: new Date(now()).toISOString(),
      ...(evidence.evidenceId ? { evidenceId: evidence.evidenceId } : {}),
    });
    const body = { keyId, sha256: entry.sha256, key: rawKey.toString("base64"), createdBy: entry.createdBy, createdAt: entry.createdAt };
    rawKey.fill(0);
    return sendJson(res, 200, body);
  }

  /**
   * Who has been given this evidence's decryption key, oldest first. Rows are matched by the file's SHA-256, so
   * releases logged before records were named still show. Without a contract the caller supplies the hash.
   */
  async function listReleases(req, res, session) {
    const evidence = await evidenceFor(req, session);
    if (evidence.error) return sendJson(res, evidence.error[0], { error: evidence.error[1] });
    if (!evidence.evidenceId) return sendJson(res, 400, { error: "Say which evidence record (?evidence=<id>)." });
    const sha256 = evidence.sha256 ?? new URL(req.url ?? "", "http://x").searchParams.get("sha256")?.toLowerCase().replace(/^0x/, "");
    if (!sha256 || !SHA256.test(sha256)) return sendJson(res, 400, { error: "Give the evidence's SHA-256 (?sha256=)." });
    const releases = (await storage.listReleases()).filter((r) => r.sha256 === sha256).map(({ address, at }) => ({ address, at }));
    return sendJson(res, 200, { releases });
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

    const storing = req.method === "POST" && path === "/api/keys";
    const listing = req.method === "GET" && path === "/api/keys/releases";
    const releasing = !listing && req.method === "GET" && path.startsWith("/api/keys/");
    if (!storing && !releasing && !listing) {
      sendJson(res, 405, { error: "Method not allowed." });
      return true;
    }
    const denied = await checkRole(session, storing ? CAPABILITIES.UPLOAD : CAPABILITIES.VIEW);
    if (denied) {
      sendJson(res, denied.status, { error: denied.error });
      return true;
    }

    if (storing) await store(req, res, session);
    else if (listing) await listReleases(req, res, session);
    else await release(req, res, session, path.slice("/api/keys/".length));
    return true;
  }

  return { handle };
}
