// The standalone HTTP server: the API (server/api.js) plus the production build in dist/, with no Vite at run time.
// Started by server/index.js (`npm start`). Kept separate from the entry point so tests can build a server on a
// temporary dist folder without listening on a fixed port or reading .env.
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { extname, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { createApi } from "./api.js";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".map", ".svg", ".txt", ".webmanifest"]);

// IPFS gateways (src/verify/ipfsFetch.js) are configurable, so connect-src allows any HTTPS origin. MetaMask talks to
// the page through its injected provider, not through fetch, so it needs no entry here. Inline styles: React sets some
// through the style attribute. Fonts come from Google Fonts (index.html).
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Headers sent on every response, API and static alike. */
export function securityHeaders({ https }) {
  const headers = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  if (https) headers["Strict-Transport-Security"] = "max-age=31536000";
  return headers;
}

/**
 * Host names the server answers to, besides localhost and IP addresses (which are always allowed, as in Vite).
 * Refusing other names blocks DNS-rebinding attacks against a server running on someone's own machine.
 * Render sets RENDER_EXTERNAL_HOSTNAME and Railway RAILWAY_PUBLIC_DOMAIN; ALLOWED_HOSTS adds custom domains.
 */
export function readAllowedHosts(env) {
  return [env.RENDER_EXTERNAL_HOSTNAME, env.RAILWAY_PUBLIC_DOMAIN, ...(env.ALLOWED_HOSTS ?? "").split(",")]
    .map((h) => h?.trim().toLowerCase())
    .filter(Boolean);
}

/** The host name of a Host header, without port or IPv6 brackets, lower-cased; null when missing. */
function hostName(header) {
  if (!header) return null;
  const value = header.trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  return value.replace(/:\d+$/, "");
}

export function isAllowedHost(header, allowedHosts) {
  const name = hostName(header);
  if (!name) return false;
  if (name === "localhost" || name.endsWith(".localhost") || isIP(name)) return true;
  return allowedHosts.includes(name);
}

/**
 * Serves files from `distDir`, with index.html for client-side routes (paths without a file extension).
 * Files are read once and kept in memory with a gzip copy: the build is a few megabytes and never changes while the
 * server runs.
 *
 * Only files that exist are cached, so the cache can never hold more than the build itself. Misses are not
 * remembered: caching them let anyone grow memory without limit by requesting random URLs.
 */
export function createStaticHandler(distDir) {
  const root = resolve(distDir);
  const cache = new Map();

  async function load(filePath) {
    const cached = cache.get(filePath);
    if (cached) return cached;
    let body;
    try {
      body = await readFile(filePath);
    } catch (err) {
      if (err?.code === "ENOENT" || err?.code === "EISDIR" || err?.code === "ENOTDIR") return null;
      throw err;
    }
    const ext = extname(filePath).toLowerCase();
    const entry = {
      body,
      gzip: COMPRESSIBLE.has(ext) && body.length > 1024 ? gzipSync(body) : null,
      type: CONTENT_TYPES[ext] ?? "application/octet-stream",
    };
    cache.set(filePath, entry);
    return entry;
  }

  function send(req, res, entry, cacheControl) {
    const useGzip = entry.gzip && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
    const body = useGzip ? entry.gzip : entry.body;
    res.statusCode = 200;
    res.setHeader("Content-Type", entry.type);
    res.setHeader("Content-Length", body.length);
    res.setHeader("Cache-Control", cacheControl);
    if (entry.gzip) res.setHeader("Vary", "Accept-Encoding");
    if (useGzip) res.setHeader("Content-Encoding", "gzip");
    res.end(req.method === "HEAD" ? undefined : body);
  }

  function sendText(res, status, text) {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(text);
  }

  return async function serveStatic(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return sendText(res, 405, "Method not allowed.");
    }
    let path;
    try {
      path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    } catch {
      return sendText(res, 400, "Bad request.");
    }
    if (path.includes("\0")) return sendText(res, 400, "Bad request.");

    const filePath = resolve(root, `.${path}`);
    if (filePath !== root && !filePath.startsWith(root + sep)) return sendText(res, 404, "Not found.");

    if (filePath !== root) {
      const entry = await load(filePath);
      if (entry) {
        const immutable = path.startsWith("/assets/"); // Vite puts a content hash in these names
        return send(req, res, entry, immutable ? "public, max-age=31536000, immutable" : path === "/index.html" ? "no-cache" : "public, max-age=3600");
      }
    }
    // A missing file with an extension is a real 404 (a stale asset, a typo), not a page of the app.
    const lastSegment = path.slice(path.lastIndexOf("/") + 1);
    if (lastSegment.includes(".")) return sendText(res, 404, "Not found.");

    const index = await load(resolve(root, "index.html"));
    if (!index) return sendText(res, 503, "The app is not built. Run `npm run build`, then start the server again.");
    return send(req, res, index, "no-cache");
  };
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env  Server-side environment.
 * @param {string} options.distDir                          The production build (`npm run build` output).
 * @param {boolean} [options.https]                         Behind HTTPS: adds Strict-Transport-Security.
 * @param {(req, res, next) => void} [options.api]          Injected by tests; defaults to the real API.
 */
export function createAppServer({ env, distDir, https = false, api = createApi(env, { production: true }) }) {
  const allowedHosts = readAllowedHosts(env);
  const serveStatic = createStaticHandler(distDir);
  const headers = securityHeaders({ https });

  return createHttpServer((req, res) => {
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    if (!isAllowedHost(req.headers.host, allowedHosts)) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("This host name is not allowed. Add it to ALLOWED_HOSTS.");
      return;
    }
    api(req, res, () => {
      if (req.url?.startsWith("/api/")) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Not found." }));
        return;
      }
      serveStatic(req, res).catch((err) => {
        console.error("[static] unexpected error:", err?.message);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end();
        }
      });
    });
  });
}
