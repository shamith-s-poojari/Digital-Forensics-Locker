import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createApi } from './server/api.js'

// Mounts the API (server/api.js) on the Vite dev and preview servers. `npm start` serves the same API and the
// production build without Vite (server/index.js).
function serverApi(env) {
  return {
    name: 'server-api',
    // Block bodies on purpose: a returned function would be run by Vite as a post-hook.
    configureServer(server) {
      server.middlewares.use(createApi(env, { production: false }))
    },
    // `npm run preview` serves the production build through the preview server, with the production API rules.
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
    // Libraries in their own chunks: they change far less often than the app, so browsers keep them cached across
    // deploys, and no single file passes Vite's 500 kB warning. (Pages are split by route in App.jsx.)
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'ethers', test: /node_modules[\\/](ethers|@noble|@adraffy)[\\/]/ },
              { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            ],
          },
        },
      },
    },
    // Tests must not see the developer's .env (a contract address there switches the app off the demo ledger the
    // tests drive). src/test has no .env file, so test runs see the same empty environment as CI.
    envDir: mode === 'test' ? 'src/test' : undefined,
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
