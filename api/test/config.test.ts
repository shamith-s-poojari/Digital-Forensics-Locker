import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fl_app:s3cr3t-pa55@localhost:5432/forensics_locker",
  WEB_ORIGIN: "http://localhost:5173",
};

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://fl_app:pw@db.internal:5432/forensics_locker?sslmode=verify-full",
  WEB_ORIGIN: "https://locker.example.org",
};

function problemsFor(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig", () => {
  it("accepts a minimal valid environment and applies defaults", () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(8787);
    expect(config.HOST).toBe("127.0.0.1");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.TRUST_PROXY).toEqual([]);
    expect(config.SESSION_ABSOLUTE_TTL_MIN).toBe(480);
    expect(config.SESSION_IDLE_TTL_MIN).toBe(30);
    expect(config.SIWE_ALLOWED_CHAIN_IDS).toBeUndefined();
  });

  it("parses explicit values", () => {
    const config = loadConfig({
      ...valid,
      PORT: "9000",
      TRUST_PROXY: "10.0.0.0/8, loopback ,2001:db8::/32",
      SIWE_DOMAIN: "locker.example.org",
      SIWE_ALLOWED_CHAIN_IDS: "11155111, 1",
      SESSION_ABSOLUTE_TTL_MIN: "60",
      SESSION_IDLE_TTL_MIN: "10",
    });
    expect(config.PORT).toBe(9000);
    expect(config.TRUST_PROXY).toEqual(["10.0.0.0/8", "loopback", "2001:db8::/32"]);
    expect(config.SIWE_ALLOWED_CHAIN_IDS).toEqual([11155111, 1]);
  });

  it("names every missing required variable", () => {
    const problems = problemsFor({});
    const names = problems.map((p) => p.split(":")[0]);
    expect(names).toEqual(expect.arrayContaining(["NODE_ENV", "DATABASE_URL", "WEB_ORIGIN"]));
    expect(problems.every((p) => p.includes("is required"))).toBe(true);
  });

  it("treats empty strings (an untouched .env.example) as missing", () => {
    expect(problemsFor({ ...valid, DATABASE_URL: "" })).toEqual(["DATABASE_URL: is required"]);
  });

  describe("never prints a value", () => {
    const sentinel = "SENTINEL-hunter2-9f3a";
    const variables = [
      "NODE_ENV",
      "HOST",
      "PORT",
      "LOG_LEVEL",
      "TRUST_PROXY",
      "DATABASE_URL",
      "WEB_ORIGIN",
      "SIWE_ALLOWED_CHAIN_IDS",
      "SESSION_ABSOLUTE_TTL_MIN",
      "SESSION_IDLE_TTL_MIN",
    ];
    const shapes = (name: string) => [sentinel, `${sentinel}:${sentinel}@${sentinel}`, `mysql://root:${sentinel}@db/x`, `${name}=${sentinel}`];

    it.each(variables)("%s", (name) => {
      let rejected = 0;
      for (const value of shapes(name)) {
        let problems: string[];
        try {
          loadConfig({ ...valid, [name]: value });
          continue; // a legal value (for example a plain host name) produces no message, so nothing can leak
        } catch (err) {
          if (!(err instanceof ConfigError)) throw err;
          problems = err.problems;
        }
        rejected++;
        expect(problems.join("\n")).not.toContain(sentinel);
        expect(problems.join("\n")).toContain(name);
      }
      // Guard against a vacuous pass: at least one hostile shape must really have been rejected.
      expect(rejected).toBeGreaterThan(0);
    });
  });

  describe("DATABASE_URL", () => {
    it.each([
      ["wrong scheme", "http://localhost/db"],
      ["empty host", "postgres:///forensics"],
      ["no user", "postgresql://localhost:5432/forensics"],
      ["no database", "postgresql://fl_app:pw@localhost:5432"],
      ["empty database", "postgresql://fl_app:pw@localhost:5432/"],
      ["bad port", "postgresql://fl_app:pw@localhost:99999999/forensics"],
      ["not a URL", "postgres://"],
    ])("rejects %s", (_label, url) => {
      const problems = problemsFor({ ...valid, DATABASE_URL: url });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/^DATABASE_URL:/);
    });

    it("accepts both postgres:// and postgresql://", () => {
      expect(() => loadConfig({ ...valid, DATABASE_URL: "postgres://u:p@localhost/db" })).not.toThrow();
      expect(() => loadConfig({ ...valid, DATABASE_URL: "postgresql://u:p@localhost/db" })).not.toThrow();
    });
  });

  describe("WEB_ORIGIN", () => {
    it.each([
      ["trailing slash", "http://localhost:5173/"],
      ["path", "http://localhost:5173/app"],
      ["no scheme", "localhost:5173"],
      ["wrong scheme", "ftp://localhost"],
    ])("rejects %s", (_label, origin) => {
      expect(problemsFor({ ...valid, WEB_ORIGIN: origin })[0]).toMatch(/^WEB_ORIGIN:/);
    });
  });

  describe("numbers", () => {
    it.each(["70000", "0", "eighty", "0x1F", "1e3", "-1", " 80", "80 ", "8080.5", ""])("rejects PORT %j", (value) => {
      if (value === "") {
        // Empty means unset, so the default applies.
        expect(loadConfig({ ...valid, PORT: value }).PORT).toBe(8787);
        return;
      }
      expect(problemsFor({ ...valid, PORT: value })[0]).toMatch(/^PORT:/);
    });

    it("gives a truthful message for a zero session timeout", () => {
      expect(problemsFor({ ...valid, SESSION_IDLE_TTL_MIN: "0" })[0]).toBe(
        "SESSION_IDLE_TTL_MIN: must be a whole number between 1 and 10080"
      );
    });

    it("rejects an idle timeout longer than the absolute timeout", () => {
      const problems = problemsFor({ ...valid, SESSION_ABSOLUTE_TTL_MIN: "10", SESSION_IDLE_TTL_MIN: "20" });
      expect(problems[0]).toMatch(/^SESSION_IDLE_TTL_MIN:.*SESSION_ABSOLUTE_TTL_MIN/);
    });
  });

  describe("SIWE_ALLOWED_CHAIN_IDS", () => {
    it.each(["1,abc", "99999999999999999999", "0", "1.5", "0x1", ",", "-5"])("rejects %j", (value) => {
      const problems = problemsFor({ ...valid, SIWE_ALLOWED_CHAIN_IDS: value });
      expect(problems[0]).toMatch(/^SIWE_ALLOWED_CHAIN_IDS:/);
      // The variable name is reported without a list index such as ".1".
      expect(problems[0]).not.toMatch(/^SIWE_ALLOWED_CHAIN_IDS\./);
    });
  });

  describe("TRUST_PROXY", () => {
    it.each(["1", "true", "banana", "10.0.0.0/33", "::1/129", "1.2.3.4/x", "1.2.3.4/8/8", "999.1.1.1"])("rejects %j", (value) => {
      expect(problemsFor({ ...valid, TRUST_PROXY: value })[0]).toMatch(/^TRUST_PROXY:/);
    });

    it("accepts the proxy-addr keywords", () => {
      expect(loadConfig({ ...valid, TRUST_PROXY: "loopback,linklocal,uniquelocal" }).TRUST_PROXY).toHaveLength(3);
    });
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(problemsFor({ ...valid, NODE_ENV: "staging" })[0]).toMatch(/^NODE_ENV:/);
  });

  it("rejects a HOST containing spaces or other junk", () => {
    expect(problemsFor({ ...valid, HOST: "not a host" })[0]).toMatch(/^HOST:/);
  });

  describe("production rules", () => {
    it("accepts a well-formed production environment", () => {
      expect(() => loadConfig(production)).not.toThrow();
    });

    it("requires an https WEB_ORIGIN", () => {
      expect(problemsFor({ ...production, WEB_ORIGIN: "http://locker.example.org" })).toEqual([
        "WEB_ORIGIN: must use https in production",
      ]);
    });

    it("forbids silent logging", () => {
      expect(problemsFor({ ...production, LOG_LEVEL: "silent" })).toEqual(["LOG_LEVEL: must not be silent in production"]);
    });

    it("requires TLS for a non-local database", () => {
      const problems = problemsFor({ ...production, DATABASE_URL: "postgresql://fl_app:pw@db.internal:5432/forensics_locker" });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/^DATABASE_URL:.*TLS/);
    });

    it.each(["require", "verify-ca", "verify-full"])("accepts sslmode=%s", (mode) => {
      expect(() =>
        loadConfig({ ...production, DATABASE_URL: `postgresql://u:p@db.internal/forensics?sslmode=${mode}` })
      ).not.toThrow();
    });

    it.each(["disable", "prefer", "allow"])("rejects sslmode=%s", (mode) => {
      expect(() =>
        loadConfig({ ...production, DATABASE_URL: `postgresql://u:p@db.internal/forensics?sslmode=${mode}` })
      ).toThrow(ConfigError);
    });

    it("allows a loopback database without TLS", () => {
      for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
        expect(() => loadConfig({ ...production, DATABASE_URL: `postgresql://u:p@${host}/forensics` })).not.toThrow();
      }
    });

    it("does not apply production rules in development or test", () => {
      expect(() => loadConfig({ ...production, NODE_ENV: "development", WEB_ORIGIN: "http://localhost:5173", LOG_LEVEL: "silent" })).not.toThrow();
    });
  });
});
