import { isIP } from "node:net";
import { z } from "zod";

/**
 * Runtime configuration, read from environment variables and validated once at boot.
 *
 * Rules:
 *  - No secret has a default.
 *  - A bad configuration stops the process. The error names the variables but NEVER prints their values:
 *    every message below is fixed text or zod's built-in wording, which does not echo input (a test sweeps
 *    every variable with a sentinel value to prove it).
 *  - Cross-variable and production-only rules run once the individual variables are valid, so a fix-and-retry
 *    loop may reveal a second batch of problems.
 */

/** A whole number written with digits only: rejects "0x1F", "1e3", "-1", " 7" and similar surprises. */
const wholeNumber = (min: number, max: number, fallback: number) => {
  const message = `must be a whole number between ${min} and ${max}`;
  return z
    .string()
    .regex(/^\d{1,9}$/, { error: message })
    .transform(Number)
    .pipe(z.number().min(min, { error: message }).max(max, { error: message }))
    .default(fallback);
};

const webOrigin = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
    } catch {
      return false;
    }
  },
  { error: "must be an exact origin such as http://localhost:5173 (scheme, host, optional port; no path or trailing slash)" }
);

const hostName = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,253}$/, { error: "must be a host name or IP address" })
  .default("127.0.0.1");

/** The parts of a postgres URL this service insists on. Returns a fixed problem string, never the value. */
function databaseUrlProblem(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "must be a valid postgres:// or postgresql:// connection URL";
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return "must be a postgres:// or postgresql:// connection URL";
  }
  if (!url.hostname) return "must include a host";
  if (!url.username) return "must include a database user";
  if (url.pathname.length <= 1) return "must include a database name";
  return undefined;
}

const databaseUrl = z.string().superRefine((value, ctx) => {
  const problem = databaseUrlProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

/** Keywords understood by the proxy-addr library that Fastify uses to decide whom to trust. */
const PROXY_KEYWORDS = new Set(["loopback", "linklocal", "uniquelocal"]);

function isProxyEntry(value: string): boolean {
  if (PROXY_KEYWORDS.has(value)) return true;
  const parts = value.split("/");
  if (parts.length > 2) return false;
  const [address = "", prefix] = parts;
  const version = isIP(address);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128);
}

/**
 * Addresses of the reverse proxies allowed to set X-Forwarded-* headers (IPs, CIDR ranges, or the keywords
 * loopback / linklocal / uniquelocal). Empty means "no proxy": forwarded headers are ignored entirely.
 */
const trustedProxies = z
  .string()
  .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
  .pipe(
    z.array(
      z.string().refine(isProxyEntry, { error: "entries must be an IP, a CIDR range, or loopback / linklocal / uniquelocal" })
    )
  )
  .default([]);

const chainIds = z
  .string()
  .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
  .pipe(
    z
      .array(z.string().regex(/^[1-9]\d{0,14}$/, { error: "must be a comma-separated list of chain IDs" }).transform(Number))
      .min(1, { error: "must list at least one chain ID" })
  )
  .optional();

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    HOST: hostName,
    PORT: wholeNumber(1, 65535, 8787),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    TRUST_PROXY: trustedProxies,
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN: webOrigin,
    // Declared now so configuration lives in one place; enforced by the login spec (1.3).
    SIWE_DOMAIN: z.string().min(1).optional(),
    SIWE_ALLOWED_CHAIN_IDS: chainIds,
    SESSION_ABSOLUTE_TTL_MIN: wholeNumber(1, 10_080, 480),
    SESSION_IDLE_TTL_MIN: wholeNumber(1, 10_080, 30),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.SESSION_IDLE_TTL_MIN > cfg.SESSION_ABSOLUTE_TTL_MIN) {
      ctx.addIssue({ code: "custom", path: ["SESSION_IDLE_TTL_MIN"], message: "must not exceed SESSION_ABSOLUTE_TTL_MIN" });
    }

    if (cfg.NODE_ENV !== "production") return;

    if (new URL(cfg.WEB_ORIGIN).protocol !== "https:") {
      ctx.addIssue({ code: "custom", path: ["WEB_ORIGIN"], message: "must use https in production" });
    }
    if (cfg.LOG_LEVEL === "silent") {
      ctx.addIssue({ code: "custom", path: ["LOG_LEVEL"], message: "must not be silent in production" });
    }

    // Evidence metadata and credentials must not cross a network in clear text.
    const db = new URL(cfg.DATABASE_URL);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(db.hostname);
    const sslMode = db.searchParams.get("sslmode");
    const tls = sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full" || db.searchParams.get("ssl") === "true";
    if (!loopback && !tls) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "must enable TLS in production for a non-local database (add sslmode=verify-full)",
      });
    }
  });

export type Config = z.infer<typeof schema>;

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/** Validates an environment object. Throws ConfigError listing the problems, without echoing values. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat empty strings (as left by an untouched .env.example) the same as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    // Use only the variable name: array indexes in the path (for example a list entry) are not meaningful to users.
    const name = String(issue.path[0] ?? "(configuration)");
    // A variable that is absent and fails as a wrong type (strings) or an unmatched enum is "required".
    const missing = !(name in cleaned) && (issue.code === "invalid_type" || issue.code === "invalid_value");
    return `${name}: ${missing ? "is required" : issue.message}`;
  });
  throw new ConfigError([...new Set(problems)]);
}
