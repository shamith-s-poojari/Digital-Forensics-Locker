import type { FastifyPluginCallback } from "fastify";
import type { Db } from "../db.js";

export interface HealthOptions {
  db: Db;
  /** How long a readiness probe waits for the database before reporting not ready. */
  readyTimeoutMs: number;
  /** How long a probe result is reused. Bounds database load from unauthenticated callers. */
  readyCacheMs: number;
}

/**
 * Liveness and readiness probes for the hosting platform.
 *  - /healthz: the process is up. Touches nothing external, so a database outage never restarts the API.
 *  - /readyz: the process can serve traffic (the database answers). 503 otherwise.
 * Responses are deliberately minimal: no versions, hostnames or error details.
 *
 * /readyz is unauthenticated, so it must not be a lever on the database: concurrent callers share one
 * in-flight probe, results are cached briefly, and the probe itself is time-boxed on the database side.
 */
export const healthRoutes: FastifyPluginCallback<HealthOptions> = (app, { db, readyTimeoutMs, readyCacheMs }, done) => {
  let inflight: Promise<boolean> | undefined;
  let cached: { at: number; ok: boolean } | undefined;

  const probe = async (): Promise<boolean> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        db.ping(readyTimeoutMs),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("database ping timed out")), readyTimeoutMs);
        }),
      ]);
      return true;
    } catch (err) {
      // Log the reason server-side; callers learn nothing beyond "not ready".
      app.log.warn({ err }, "readiness check failed");
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const isReady = (): Promise<boolean> => {
    if (cached && Date.now() - cached.at < readyCacheMs) return Promise.resolve(cached.ok);
    inflight ??= probe()
      .then((ok) => {
        cached = { at: Date.now(), ok };
        return ok;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  };

  app.get("/healthz", () => ({ status: "ok" }));

  app.get("/readyz", async (_request, reply) => {
    if (await isReady()) return { status: "ready" };
    return reply.code(503).send({ status: "unavailable" });
  });

  done();
};
