import pg from "pg";

/**
 * The narrow database surface the app depends on. Keeping it this small lets tests inject a fake and
 * keeps all SQL out of the HTTP layer. Spec 1.2 extends this with the typed query layer.
 * (Members are properties, not methods, so they can be passed around without losing `this`.)
 */
export interface Db {
  /** Resolves if the database answers a trivial query within `timeoutMs`; rejects otherwise. */
  ping: (timeoutMs: number) => Promise<void>;
  /** Closes all connections. Called once at shutdown. */
  close: () => Promise<void>;
}

export interface DbOptions {
  /**
   * Called when an idle pooled connection fails (for example the database restarts). Receives only the error
   * code, never the message, so connection details cannot reach the logs through this path.
   */
  onPoolError?: (error: { code?: string }) => void;
}

export function createDb(connectionString: string, options: DbOptions = {}): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
    // Client-side cap on any single query. The server-side `statement_timeout` is set per role in the
    // migrations (spec 1.2) rather than as a startup parameter, which connection poolers often reject.
    query_timeout: 10_000,
  });

  // Without a listener an idle client error would crash the process (pg-pool re-emits it on the pool).
  pool.on("error", (err: Error & { code?: string }) => {
    options.onPoolError?.(err.code === undefined ? {} : { code: err.code });
  });

  return {
    ping: async (timeoutMs) => {
      // node-postgres honours a per-query `query_timeout` at runtime, but @types/pg omits it from QueryConfig.
      // Going through a typed variable (not a fresh literal) lets the extra property through the type check.
      const query: pg.QueryConfig & { query_timeout: number } = { text: "select 1", query_timeout: timeoutMs };
      await pool.query(query);
    },
    close: async () => {
      await pool.end();
    },
  };
}
