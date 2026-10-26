import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handlePinRequest, resolvePinataJwt } from './server/pinataProxy.js'
import { createSiweAuth } from './server/siweAuth.js'
import { createKeyStore, parseMasterKey } from './server/keyStore.js'
import { resolve } from 'node:path'

function sendInternalError(res, label, err) {
  console.error(`[${label}] unexpected error:`, err?.message)
  if (!res.headersSent) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error.' }))
  }
}

// Mounts the wallet sign-in endpoints (/api/auth/*), the evidence key store (/api/keys) and POST /api/pin on the
// Vite dev and preview servers. The master key, like the Pinata JWT, is read only here.
// The Pinata JWT is read here, in Node, and is never exposed to the browser bundle (it is not passed through
// `define` or import.meta.env). /api/pin is refused unless the caller holds a sign-in session.
function serverApi(env) {
  const { jwt, legacy } = resolvePinataJwt(env)
  // Sign-ins are not pinned to a chain: a wallet may sign in first and switch network afterwards (the ledger
  // provider refuses the wrong network on its own, and the contract can only be written on its chain).
  const auth = createSiweAuth()
  const authorize = (req) => auth.getSession(req) !== null
  const keyStore = createKeyStore({
    masterKey: parseMasterKey(env.EVIDENCE_MASTER_KEY),
    masterKeyVersion: Number(env.EVIDENCE_MASTER_KEY_VERSION) > 0 ? Number(env.EVIDENCE_MASTER_KEY_VERSION) : 1,
    filePath: resolve(env.EVIDENCE_KEY_STORE || '.data/evidence-keys.json'),
    accessLogPath: resolve(env.EVIDENCE_KEY_ACCESS_LOG || '.data/key-access.log'),
    getSession: auth.getSession,
  })
  let warned = false
  const middleware = (req, res, next) => {
    const path = req.url?.split('?')[0]
    if (path?.startsWith('/api/auth/')) {
      auth.handle(req, res).catch((err) => sendInternalError(res, 'siwe-auth', err))
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
    handlePinRequest(req, res, { jwt, authorize }).catch((err) => sendInternalError(res, 'pinata-proxy', err))
  }
  return {
    name: 'server-api',
    // Block bodies on purpose: a returned function would be run by Vite as a post-hook.
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix: load every variable for server-side use only (see serverApi above).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), serverApi(env)],
    // contracts/ is its own package with its own test runner (Hardhat); the web app's run must not pick it up.
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', 'contracts/**'],
    },
  }
})
