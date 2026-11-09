// Entry point of the standalone server: `npm start` (after `npm run build`). Serves the production build in dist/ and
// the API, with no Vite at run time. See server/app.js.
//
// Environment: real environment variables (set on the host, e.g. Render's dashboard) win; .env files fill in the rest,
// in the same order Vite reads them for a production build. PORT (default 4173) and HOST (default 0.0.0.0 when PORT is
// set, as on a host; otherwise 127.0.0.1, this machine only).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createAppServer } from "./app.js";

const ENV_FILES = [".env.production.local", ".env.local", ".env.production", ".env"];

function loadEnvFiles(dir) {
  for (const name of ENV_FILES) {
    const path = resolve(dir, name);
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

const cwd = process.cwd();
loadEnvFiles(cwd);
const env = process.env;
const distDir = resolve(cwd, "dist");
if (!existsSync(resolve(distDir, "index.html"))) {
  console.error("dist/index.html not found. Run `npm run build` first.");
  process.exit(1);
}

const port = Number(env.PORT) || 4173;
const host = env.HOST || (env.PORT ? "0.0.0.0" : "127.0.0.1");
// Hosts terminate TLS in front of the app; HTTPS=false turns Strict-Transport-Security off for plain-HTTP setups.
const https = env.HTTPS ? env.HTTPS !== "false" : Boolean(env.PORT);
const server = createAppServer({ env, distDir, https });

server.listen(port, host, () => {
  const ledger = env.VITE_LOCKER_ADDRESS ? `contract ${env.VITE_LOCKER_ADDRESS} on chain ${env.VITE_CHAIN_ID || "11155111"}` : "no contract (API grants nothing)";
  console.log(`Digital Forensics Locker listening on http://${host === "0.0.0.0" ? "localhost" : host}:${port} (${ledger})`);
});

// Hosts stop a service with SIGTERM: finish open requests, then exit.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
