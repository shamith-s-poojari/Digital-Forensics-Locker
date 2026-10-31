import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handlePinRequest, resolvePinataJwt } from './server/pinataProxy.js'
import { createSiweAuth } from './server/siweAuth.js'
import { createKeyStore, parseMasterKey } from './server/keyStore.js'
import { createCaseStore } from './server/caseStore.js'
import { createAccessRequestStore } from './server/accessRequests.js'
import { createChainRoleReader, createRoleGate } from './server/chainRoles.js'
import { CAPABILITIES } from './src/web3/roles.js'
import { resolve } from 'node:path'

function sendInternalError(res, label, err) {
  console.error(`[${label}] unexpected error:`, err?.message)
  if (!res.headersSent) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error.' }))
  }
}

/**
 * The on-chain role check for the API (server/chainRoles.js). With a contract configured, roles are read from it over
 * RPC_URL. Without one, only the dev server lets requests through (its demo ledger lives in the browser); a production
 * server grants nothing, like the production UI.
 */
function createGate(env, { production }) {
  const address = env.VITE_LOCKER_ADDRESS?.trim()
  if (!address) return createRoleGate({ readRoles: null, allowWithoutContract: !production })
  if (!env.RPC_URL) {
    console.error('[roles] VITE_LOCKER_ADDRESS is set but RPC_URL is not: every API request needing a role will be refused.')
    return createRoleGate({ readRoles: null, misconfigured: 'The server cannot read roles: RPC_URL is not set.' })
  }
  const chainId = Number(env.VITE_CHAIN_ID) || undefined
  return createRoleGate({ readRoles: createChainRoleReader({ rpcUrl: env.RPC_URL, address, chainId }) })
}

// Mounts the wallet sign-in endpoints (/api/auth/*), the evidence key store (/api/keys), the case store, access
// requests and POST /api/pin on the Vite dev and preview servers. The master key, like the Pinata JWT, is read only
// here, in Node, and is never exposed to the browser bundle (it is not passed through `define` or import.meta.env).
// Every data endpoint needs a sign-in session and a role on the contract (see createGate).
function createApi(env, { production }) {
  const { jwt, legacy } = resolvePinataJwt(env)
  // Sign-ins are not pinned to a chain: a wallet may sign in first and switch network afterwards (the ledger
  // provider refuses the wrong network on its own, and the contract can only be written on its chain).
  // The production server sits behind HTTPS (Railway), so its session cookie is `Secure`.
  const auth = createSiweAuth({ secureCookie: production })
  const authorize = (req) => auth.getSession(req) !== null
  const gate = createGate(env, { production })
  const dataDir = env.DATA_DIR || '.data'
  const keyStore = createKeyStore({
    masterKey: parseMasterKey(env.EVIDENCE_MASTER_KEY),
    masterKeyVersion: Number(env.EVIDENCE_MASTER_KEY_VERSION) > 0 ? Number(env.EVIDENCE_MASTER_KEY_VERSION) : 1,
    filePath: resolve(env.EVIDENCE_KEY_STORE || `${dataDir}/evidence-keys.json`),
    accessLogPath: resolve(env.EVIDENCE_KEY_ACCESS_LOG || `${dataDir}/key-access.log`),
    getSession: auth.getSession,
    checkRole: gate.check,
  })
  const caseStore = createCaseStore({
    filePath: resolve(env.CASE_STORE || `${dataDir}/cases.json`),
    getSession: auth.getSession,
    checkRole: gate.check,
    readScope: gate.scope,
  })
  const accessRequests = createAccessRequestStore({
    filePath: resolve(env.ACCESS_REQUEST_STORE || `${dataDir}/access-requests.json`),
    getSession: auth.getSession,
    checkRole: gate.check,
    readScope: gate.scope,
  })
  const checkUpload = (req) => gate.check(auth.getSession(req), CAPABILITIES.UPLOAD)
  let warned = false
  const middleware = (req, res, next) => {
    const path = req.url?.split('?')[0]
    if (path?.startsWith('/api/auth/')) {
      auth.handle(req, res).catch((err) => sendInternalError(res, 'siwe-auth', err))
      return
    }
    if (path === '/api/cases' || path?.startsWith('/api/cases/')) {
      caseStore.handle(req, res).catch((err) => sendInternalError(res, 'case-store', err))
      return
    }
    if (path === '/api/access-requests' || path?.startsWith('/api/access-requests/')) {
      accessRequests.handle(req, res).catch((err) => sendInternalError(res, 'access-requests', err))
      return
    }
    if (path === '/api/keys' || path?.startsWith('/api/keys/')) {
      keyStore.handle(req, res).catch((err) => sendInternalError(res, 'key-store', err))
      return
    }
    if (path !== '/api/pin') return next()
    if (legacy && !warned) {
      warned = true
      console.warn('[pinata-proxy] Using VITE_PINATA_JWT. Rename it to PINATA_JWT in .env (no VITE_ prefix) and rotate the key.')
    }
    handlePinRequest(req, res, { jwt, authorize, checkRole: checkUpload }).catch((err) => sendInternalError(res, 'pinata-proxy', err))
  }
  return middleware
}

function serverApi(env) {
  return {
    name: 'server-api',
    // Block bodies on purpose: a returned function would be run by Vite as a post-hook.
    configureServer(server) {
      server.middlewares.use(createApi(env, { production: false }))
    },
    // `npm start` (Railway) and `npm run preview` serve the production build through the preview server.
    configurePreviewServer(server) {
      server.middlewares.use(createApi(env, { production: true }))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix: load every variable for server-side use only (see serverApi above).
  const env = loadEnv(mode, process.cwd(), '')
  // Railway sets PORT and RAILWAY_PUBLIC_DOMAIN. ALLOWED_HOSTS adds a custom domain (comma-separated).
  const allowedHosts = [env.RAILWAY_PUBLIC_DOMAIN, ...(env.ALLOWED_HOSTS ?? '').split(',')].map((h) => h?.trim()).filter(Boolean)
  return {
    plugins: [react(), serverApi(env)],
    preview: env.PORT
      ? { host: '0.0.0.0', port: Number(env.PORT), strictPort: true, allowedHosts }
      : undefined,
    // contracts/ is its own package with its own test runner (Hardhat); the web app's run must not pick it up.
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', 'contracts/**'],
      setupFiles: ['./src/test/setupEthers.js'],
    },
  }
})
