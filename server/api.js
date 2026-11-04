// The API: wallet sign-in (/api/auth/*), the case store, access requests, the evidence key store (/api/keys) and
// POST /api/pin, as one Connect-style middleware `(req, res, next)`. Mounted by the standalone server
// (server/index.js, `npm start`) and by the Vite dev and preview servers (vite.config.js), so all three behave alike.
// Every secret (Pinata JWT, master key, RPC URL) is read here, in Node, and never reaches the browser bundle.
import { resolve } from "node:path";
import { handlePinRequest, resolvePinataJwt } from "./pinataProxy.js";
import { createSiweAuth } from "./siweAuth.js";
import { createKeyStore, parseMasterKey } from "./keyStore.js";
import { createCaseStore } from "./caseStore.js";
import { createAccessRequestStore } from "./accessRequests.js";
import { createChainRoleReader, createRoleGate } from "./chainRoles.js";
import { createFileStorage } from "./storage/fileStorage.js";
import { createPostgresStorage } from "./storage/postgresStorage.js";
import { CAPABILITIES } from "../src/web3/roles.js";

function sendInternalError(res, label, err) {
  console.error(`[${label}] unexpected error:`, err?.message);
  if (!res.headersSent) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal server error." }));
  }
}

/**
 * The on-chain role check for the API (server/chainRoles.js). With a contract configured, roles are read from it over
 * RPC_URL. Without one, only the dev server lets requests through (its demo ledger lives in the browser); a production
 * server grants nothing, like the production UI.
 */
export function createGate(env, { production }) {
  const address = env.VITE_LOCKER_ADDRESS?.trim();
  if (!address) return createRoleGate({ readRoles: null, allowWithoutContract: !production });
  if (!env.RPC_URL) {
    console.error("[roles] VITE_LOCKER_ADDRESS is set but RPC_URL is not: every API request needing a role will be refused.");
    return createRoleGate({ readRoles: null, misconfigured: "The server cannot read roles: RPC_URL is not set." });
  }
  const chainId = Number(env.VITE_CHAIN_ID) || undefined;
  return createRoleGate({ readRoles: createChainRoleReader({ rpcUrl: env.RPC_URL, address, chainId }) });
}

/** Where the JSON-file storage keeps each collection. Also read by scripts/import-data.mjs. */
export function fileStoragePaths(env) {
  const dataDir = env.DATA_DIR || ".data";
  return {
    caseFile: resolve(env.CASE_STORE || `${dataDir}/cases.json`),
    accessRequestFile: resolve(env.ACCESS_REQUEST_STORE || `${dataDir}/access-requests.json`),
    keyFile: resolve(env.EVIDENCE_KEY_STORE || `${dataDir}/evidence-keys.json`),
    accessLogFile: resolve(env.EVIDENCE_KEY_ACCESS_LOG || `${dataDir}/key-access.log`),
  };
}

/** Postgres when DATABASE_URL is set, otherwise JSON files. */
function createStorage(env, { production }) {
  if (!env.DATABASE_URL) {
    if (production) console.warn("[storage] DATABASE_URL is not set: using JSON files, which are lost on a host without a persistent disk.");
    return createFileStorage(fileStoragePaths(env));
  }
  const storage = createPostgresStorage({ connectionString: env.DATABASE_URL });
  // Report a bad URL or an unreachable database at start-up. Requests retry, as the database may just be waking up.
  storage.ready().catch((err) => console.error("[storage] could not prepare the database:", err.message));
  return storage;
}

/**
 * Builds the API middleware. Requests outside /api/auth/*, /api/cases, /api/access-requests, /api/keys and /api/pin
 * are passed to `next`. Every data endpoint needs a sign-in session and a role on the contract (see createGate).
 *
 * @param {Record<string, string | undefined>} env  Server-side environment (process.env, or Vite's loadEnv result).
 * @param {{ production: boolean }} options          production: HTTPS deployment (`Secure` cookie, no demo-ledger bypass).
 */
export function createApi(env, { production }) {
  const { jwt, legacy } = resolvePinataJwt(env);
  // Sign-ins are not pinned to a chain: a wallet may sign in first and switch network afterwards (the ledger
  // provider refuses the wrong network on its own, and the contract can only be written on its chain).
  // The production server sits behind HTTPS, so its session cookie is `Secure`.
  const auth = createSiweAuth({ secureCookie: production });
  const authorize = (req) => auth.getSession(req) !== null;
  const gate = createGate(env, { production });
  const storage = createStorage(env, { production });
  const keyStore = createKeyStore({
    masterKey: parseMasterKey(env.EVIDENCE_MASTER_KEY),
    masterKeyVersion: Number(env.EVIDENCE_MASTER_KEY_VERSION) > 0 ? Number(env.EVIDENCE_MASTER_KEY_VERSION) : 1,
    storage: storage.keys,
    getSession: auth.getSession,
    checkRole: gate.check,
  });
  const caseStore = createCaseStore({
    storage: storage.cases,
    getSession: auth.getSession,
    checkRole: gate.check,
    readScope: gate.scope,
  });
  const accessRequests = createAccessRequestStore({
    storage: storage.accessRequests,
    getSession: auth.getSession,
    checkRole: gate.check,
    readScope: gate.scope,
  });
  const checkUpload = (req) => gate.check(auth.getSession(req), CAPABILITIES.UPLOAD);
  let warned = false;
  return (req, res, next) => {
    const path = req.url?.split("?")[0];
    if (path?.startsWith("/api/auth/")) {
      auth.handle(req, res).catch((err) => sendInternalError(res, "siwe-auth", err));
      return;
    }
    if (path === "/api/cases" || path?.startsWith("/api/cases/")) {
      caseStore.handle(req, res).catch((err) => sendInternalError(res, "case-store", err));
      return;
    }
    if (path === "/api/access-requests" || path?.startsWith("/api/access-requests/")) {
      accessRequests.handle(req, res).catch((err) => sendInternalError(res, "access-requests", err));
      return;
    }
    if (path === "/api/keys" || path?.startsWith("/api/keys/")) {
      keyStore.handle(req, res).catch((err) => sendInternalError(res, "key-store", err));
      return;
    }
    if (path !== "/api/pin") return next();
    if (legacy && !warned) {
      warned = true;
      console.warn("[pinata-proxy] Using VITE_PINATA_JWT. Rename it to PINATA_JWT in .env (no VITE_ prefix) and rotate the key.");
    }
    handlePinRequest(req, res, { jwt, authorize, checkRole: checkUpload }).catch((err) => sendInternalError(res, "pinata-proxy", err));
  };
}
