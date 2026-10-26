import type { FastifyBaseLogger } from "fastify";
import { buildApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { createDb } from "./db.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // ConfigError messages name the variables but never their values, so printing is safe.
    console.error(err instanceof ConfigError ? err.message : "Failed to load configuration.");
    // exitCode (not exit()) lets the buffered stderr flush; nothing else is running yet, so the process ends.
    process.exitCode = 1;
    return;
  }

  // The logger exists only after the app is built, and the app needs the database: bridge the two.
  const logRef: { current?: FastifyBaseLogger } = {};
  const db = createDb(config.DATABASE_URL, {
    onPoolError: (error) => logRef.current?.warn(error, "idle database connection failed"),
  });
  const app = await buildApp(config, { db });
  logRef.current = app.log;

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");

    // Hard stop if in-flight requests refuse to finish.
    const force = setTimeout(() => {
      app.log.error("shutdown timed out, exiting");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, "error during shutdown");
        process.exit(1);
      }
    );
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err: unknown) => {
  console.error("Fatal error during startup:", err instanceof Error ? err.message : "unknown error");
  process.exitCode = 1;
});
