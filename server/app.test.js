import { request } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppServer, isAllowedHost, readAllowedHosts } from "./app.js";

const INDEX_HTML = "<!doctype html><title>Locker</title><div id=root></div>";
const BIG_JS = `console.log(${JSON.stringify("x".repeat(5000))});`;

let dir;
let server;
let port;

/** Starts a server on a free port with a temporary dist/ folder. */
async function start({ env = {}, https = false, api } = {}) {
  server = createAppServer({ env, distDir: dir, https, ...(api ? { api } : {}) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
}

/** A raw HTTP request, so tests can set any Host header (fetch cannot). */
function get(path, { method = "GET", host = `localhost:${port}`, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { host, ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "dfl-dist-"));
  await mkdir(join(dir, "assets"));
  await writeFile(join(dir, "index.html"), INDEX_HTML);
  await writeFile(join(dir, "assets", "index-abc123.js"), BIG_JS);
  await writeFile(join(dir, "favicon.svg"), "<svg/>");
});
afterEach(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  server = null;
  await rm(dir, { recursive: true, force: true });
});

describe("static files", () => {
  it("serves index.html at / and for client-side routes, never cached", async () => {
    await start();
    for (const path of ["/", "/cases/CASE-1", "/admin/roles?tab=2"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(res.headers["cache-control"]).toBe("no-cache");
      expect(res.body.toString()).toBe(INDEX_HTML);
    }
  });

  it("serves hashed assets as immutable, with gzip when the client accepts it", async () => {
    await start();
    const plain = await get("/assets/index-abc123.js");
    expect(plain.status).toBe(200);
    expect(plain.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(plain.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body.toString()).toBe(BIG_JS);

    const zipped = await get("/assets/index-abc123.js", { headers: { "accept-encoding": "gzip, br" } });
    expect(zipped.headers["content-encoding"]).toBe("gzip");
    expect(zipped.headers.vary).toBe("Accept-Encoding");
    expect(gunzipSync(zipped.body).toString()).toBe(BIG_JS);
  });

  it("answers HEAD with headers only", async () => {
    await start();
    const res = await get("/favicon.svg", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/svg+xml");
    expect(res.body.length).toBe(0);
  });

  it("returns 404 for a missing file with an extension instead of the app page", async () => {
    await start();
    const res = await get("/assets/index-old999.js");
    expect(res.status).toBe(404);
    expect(res.body.toString()).not.toContain("Locker");
  });

  it("never serves files outside dist/", async () => {
    await writeFile(join(dir, "..", "dfl-secret.txt"), "secret").catch(() => {});
    await start();
    for (const path of ["/../dfl-secret.txt", "/%2e%2e/dfl-secret.txt", "/assets/..%2f..%2fdfl-secret.txt", "/..%5cdfl-secret.txt"]) {
      const res = await get(path);
      expect(res.body.toString()).not.toBe("secret");
    }
    await rm(join(dir, "..", "dfl-secret.txt"), { force: true });
  });

  it("refuses malformed paths and other methods", async () => {
    await start();
    expect((await get("/%E0%A4%A")).status).toBe(400);
    expect((await get("/a%00b")).status).toBe(400);
    const post = await get("/", { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe("GET, HEAD");
  });
});

describe("API routing", () => {
  it("hands /api requests to the API before static files", async () => {
    const seen = [];
    await start({
      api: (req, res, next) => {
        if (req.url === "/api/cases") {
          seen.push(req.url);
          res.end("from api");
          return;
        }
        next();
      },
    });
    expect((await get("/api/cases")).body.toString()).toBe("from api");
    expect(seen).toEqual(["/api/cases"]);
  });

  it("returns a JSON 404 for unknown /api paths instead of the app page", async () => {
    await start({ api: (req, res, next) => next() });
    const res = await get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(res.body.toString())).toEqual({ error: "Not found." });
  });

  it("mounts the real API (sign-in session endpoint) with no contract configured", async () => {
    await start();
    const res = await get("/api/auth/session");
    // The sign-in module's own answer for "no session", not the router's JSON 404 or the app page.
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(JSON.parse(res.body.toString()).error).not.toBe("Not found.");
  });
});

describe("headers and host check", () => {
  it("sends security headers on every response, HSTS only behind HTTPS", async () => {
    await start();
    const res = await get("/");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
    await new Promise((resolve) => server.close(resolve));

    await start({ https: true });
    expect((await get("/")).headers["strict-transport-security"]).toBe("max-age=31536000");
  });

  it("refuses unknown host names (DNS rebinding) but allows configured ones", async () => {
    await start({ env: { RENDER_EXTERNAL_HOSTNAME: "locker.onrender.com", ALLOWED_HOSTS: "evidence.example.org" } });
    expect((await get("/", { host: "attacker.example" })).status).toBe(403);
    expect((await get("/", { host: "locker.onrender.com" })).status).toBe(200);
    expect((await get("/", { host: "EVIDENCE.example.org:443" })).status).toBe(200);
  });
});

describe("isAllowedHost", () => {
  it("always allows localhost and IP addresses", () => {
    for (const host of ["localhost:4173", "app.localhost", "127.0.0.1:4173", "192.168.1.20", "[::1]:4173"]) {
      expect(isAllowedHost(host, [])).toBe(true);
    }
  });

  it("refuses a missing Host header and unlisted names", () => {
    expect(isAllowedHost(undefined, [])).toBe(false);
    expect(isAllowedHost("localhost.attacker.example", [])).toBe(false);
    expect(isAllowedHost("example.com", readAllowedHosts({ ALLOWED_HOSTS: " other.com , " }))).toBe(false);
  });
});
