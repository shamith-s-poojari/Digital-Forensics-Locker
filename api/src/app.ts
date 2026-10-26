import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { healthRoutes } from "./routes/health.js";

export interface AppDeps {
  db: Db;
}

export interface AppOptions {
  /** Override Fastify's logger (tests pass `false` or a capturing stream). */
  logger?: FastifyServerOptions["logger"];
  /** How long /readyz waits for the database. Default 2000 ms. */
  readyTimeoutMs?: number;
  /** How long a /readyz result is reused. Default 1000 ms; tests use 0 to see every probe. */
  readyCacheMs?: number;
}

/**
 * Builds the Fastify application without listening on a port, so tests can use `app.inject()`.
 * The caller owns the process lifecycle (see server.ts); closing the app also closes the database.
 */
export async function buildApp(config: Config, deps: AppDeps, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? { level: config.LOG_LEVEL },
    // Honour X-Forwarded-* only when the connection comes from a listed proxy address. With no list, forwarded
    // headers are ignored, so a direct client cannot forge its IP, host or protocol. (Fastify deliberately
    // refuses bare hop counts for the same reason.)
    trustProxy: config.TRUST_PROXY.length > 0 ? config.TRUST_PROXY : false,
  });

  await app.register(healthRoutes, {
    db: deps.db,
    readyTimeoutMs: options.readyTimeoutMs ?? 2_000,
    readyCacheMs: options.readyCacheMs ?? 1_000,
  });

  app.addHook("onClose", async () => {
    await deps.db.close();
  });

  return app;
}
