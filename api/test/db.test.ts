import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db.js";

const SENTINEL = "SENTINEL-db-password-7c1d";
// Port 1 is never listening, so connecting fails immediately with ECONNREFUSED.
const unreachableUrl = `postgresql://fl_app:${SENTINEL}@127.0.0.1:1/forensics_locker`;

const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: unreachableUrl, WEB_ORIGIN: "http://localhost:5173" });

describe("createDb (real pg pool, unreachable database)", () => {
  it("ping rejects and close still resolves", async () => {
    const db = createDb(unreachableUrl);
    await expect(db.ping(500)).rejects.toThrow();
    await expect(db.close()).resolves.toBeUndefined();
  });

  it("/readyz answers 503 and no log line or response contains the database password", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const db = createDb(unreachableUrl);
    const app = await buildApp(config, { db }, { logger: { level: "trace", stream }, readyCacheMs: 0, readyTimeoutMs: 1_000 });

    const res = await app.inject({ method: "GET", url: "/readyz" });
    await app.close();

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain(SENTINEL);
    const logged = lines.join("");
    expect(logged).toContain("readiness check failed"); // the failure path really ran and really logged
    expect(logged).not.toContain(SENTINEL);
  });
});
