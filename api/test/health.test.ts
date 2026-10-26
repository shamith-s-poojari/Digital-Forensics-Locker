import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { Db } from "../src/db.js";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fl_app:pw@localhost:5432/forensics_locker",
  WEB_ORIGIN: "http://localhost:5173",
});

type FakeDb = Db & { ping: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

function fakeDb(overrides: Partial<Db> = {}): FakeDb {
  return {
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as FakeDb;
}

/** Most tests want to see every probe, so the result cache is disabled unless a test says otherwise. */
const noCache = { logger: false as const, readyCacheMs: 0 };

describe("health routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("GET /healthz returns 200 and never touches the database", async () => {
    const db = fakeDb({ ping: vi.fn().mockRejectedValue(new Error("db down")) });
    app = await buildApp(config, { db }, noCache);

    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(db.ping).not.toHaveBeenCalled();
  });

  it("GET /readyz returns 200 when the database answers, and bounds the query with the timeout", async () => {
    const db = fakeDb();
    app = await buildApp(config, { db }, { ...noCache, readyTimeoutMs: 1234 });

    const res = await app.inject({ method: "GET", url: "/readyz" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
    expect(db.ping).toHaveBeenCalledTimes(1);
    expect(db.ping).toHaveBeenCalledWith(1234);
  });

  it("GET /readyz returns 503 when the database is unreachable, without leaking the reason", async () => {
    const db = fakeDb({ ping: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2")) });
    app = await buildApp(config, { db }, noCache);

    const res = await app.inject({ method: "GET", url: "/readyz" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    expect(res.body).not.toContain("hunter2");
    expect(res.body).not.toContain("10.0.0.5");
  });

  it("GET /readyz returns 503 when the database hangs past the timeout", async () => {
    const db = fakeDb({ ping: vi.fn().mockImplementation(() => new Promise<void>(() => undefined)) });
    app = await buildApp(config, { db }, { ...noCache, readyTimeoutMs: 40 });

    const started = Date.now();
    const res = await app.inject({ method: "GET", url: "/readyz" });

    expect(res.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("recovers: /readyz goes from 503 to 200 when the database comes back", async () => {
    const ping = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    app = await buildApp(config, { db: fakeDb({ ping }) }, noCache);

    expect((await app.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(200);
  });
});

describe("/readyz cannot be used to load the database", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("shares one in-flight probe between concurrent callers", async () => {
    let release!: () => void;
    const ping = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    app = await buildApp(config, { db: fakeDb({ ping }) }, { logger: false, readyCacheMs: 0 });

    const requests = Array.from({ length: 25 }, () => app!.inject({ method: "GET", url: "/readyz" }));
    await vi.waitFor(() => expect(ping).toHaveBeenCalled());
    release();
    const responses = await Promise.all(requests);

    expect(responses.every((r) => r.statusCode === 200)).toBe(true);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("reuses a result for the cache window, then probes again", async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    app = await buildApp(config, { db: fakeDb({ ping }) }, { logger: false, readyCacheMs: 60 });

    await app.inject({ method: "GET", url: "/readyz" });
    await app.inject({ method: "GET", url: "/readyz" });
    await app.inject({ method: "GET", url: "/readyz" });
    expect(ping).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 90));
    await app.inject({ method: "GET", url: "/readyz" });
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("caches failures too, so a dead database is not hammered", async () => {
    const ping = vi.fn().mockRejectedValue(new Error("down"));
    app = await buildApp(config, { db: fakeDb({ ping }) }, { logger: false, readyCacheMs: 1_000 });

    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(503);
    }
    expect(ping).toHaveBeenCalledTimes(1);
  });
});

describe("app lifecycle", () => {
  it("closes the database pool exactly once when the app closes", async () => {
    const db = fakeDb();
    const app = await buildApp(config, { db }, { logger: false });

    await app.close();

    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it("does not listen on a port by itself", async () => {
    const app = await buildApp(config, { db: fakeDb() }, { logger: false });
    expect(app.server.listening).toBe(false);
    await app.close();
  });
});
