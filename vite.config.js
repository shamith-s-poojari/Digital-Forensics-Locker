import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handlePinRequest, resolvePinataJwt } from './server/pinataProxy.js'

// Mounts POST /api/pin on the Vite dev and preview servers. The Pinata JWT is read here, in Node, and
// is never exposed to the browser bundle (it is not passed through `define` or import.meta.env).
function pinataProxy(env) {
  const { jwt, legacy } = resolvePinataJwt(env)
  let warned = false
  const middleware = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/pin') return next()
    if (legacy && !warned) {
      warned = true
      console.warn('[pinata-proxy] Using VITE_PINATA_JWT. Rename it to PINATA_JWT in .env (no VITE_ prefix) and rotate the key.')
    }
    handlePinRequest(req, res, { jwt }).catch((err) => {
      console.error('[pinata-proxy] unexpected error:', err?.message)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Internal proxy error.' }))
      }
    })
  }
  return {
    name: 'pinata-proxy',
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
  // '' prefix: load every variable for server-side use only (see pinataProxy above).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), pinataProxy(env)],
  }
})
