import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { Db } from "../src/db.js";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fl_app:pw@localhost:5432/forensics_locker",
  WEB_ORIGIN: "http://localhost:5173",
};

const db = (): Db => ({ ping: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) });

interface Seen {
  ip: string;
  host: string;
  protocol: string;
}

/** Sends one request from `peer` and reports what the app believes about the client, host and protocol. */
async function seenByApp(trustProxy: string | undefined, peer: string, headers: Record<string, string> = {}): Promise<Seen> {
  const env = trustProxy === undefined ? baseEnv : { ...baseEnv, TRUST_PROXY: trustProxy };
  const app: FastifyInstance = await buildApp(loadConfig(env), { db: db() }, { logger: false });
  app.get("/__seen", (request) => ({ ip: request.ip, host: request.host, protocol: request.protocol }));
  try {
    const res = await app.inject({ method: "GET", url: "/__seen", remoteAddress: peer, headers: { host: "api.internal", ...headers } });
    return res.json<Seen>();
  } finally {
    await app.close();
  }
}

const spoof = { "x-forwarded-for": "203.0.113.7", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" };

describe("client IP, host and protocol detection", () => {
  it("ignores every forwarded header when no proxy is configured", async () => {
    expect(await seenByApp(undefined, "10.0.0.9", spoof)).toEqual({ ip: "10.0.0.9", host: "api.internal", protocol: "http" });
  });

  it("ignores forwarded headers from a peer that is NOT a listed proxy (direct access to the API port)", async () => {
    // The configured proxy is 10.0.0.1; the request arrives straight from an attacker at 198.51.100.50.
    expect(await seenByApp("10.0.0.1", "198.51.100.50", spoof)).toEqual({
      ip: "198.51.100.50",
      host: "api.internal",
      protocol: "http",
    });
  });

  it("honours forwarded headers from a listed proxy", async () => {
    expect(await seenByApp("10.0.0.0/8", "10.0.0.9", spoof)).toEqual({ ip: "203.0.113.7", host: "evil.example", protocol: "https" });
  });

  it("takes the first untrusted address from the right, so a client cannot prepend a fake hop", async () => {
    const seen = await seenByApp("10.0.0.9", "10.0.0.9", { "x-forwarded-for": "198.51.100.1, 203.0.113.7" });
    expect(seen.ip).toBe("203.0.113.7");
  });

  it("walks through a chain of trusted proxies to the real client", async () => {
    const seen = await seenByApp("10.0.0.0/8", "10.0.0.9", { "x-forwarded-for": "203.0.113.7, 10.0.0.5" });
    expect(seen.ip).toBe("203.0.113.7");
  });

  it("uses the peer address when a trusted proxy sends no X-Forwarded-For", async () => {
    expect((await seenByApp("10.0.0.0/8", "10.0.0.9")).ip).toBe("10.0.0.9");
  });

  it("supports the loopback keyword", async () => {
    expect((await seenByApp("loopback", "127.0.0.1", { "x-forwarded-for": "203.0.113.7" })).ip).toBe("203.0.113.7");
    expect((await seenByApp("loopback", "198.51.100.50", { "x-forwarded-for": "203.0.113.7" })).ip).toBe("198.51.100.50");
  });
});
