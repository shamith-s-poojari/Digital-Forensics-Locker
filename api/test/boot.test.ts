import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../src/server.ts", import.meta.url));
const apiDir = fileURLToPath(new URL("..", import.meta.url));

/** Starts the real entry point in a child process with exactly the given environment. */
function boot(env: Record<string, string>) {
  return spawnSync(process.execPath, ["--import", "tsx", entry], {
    cwd: apiDir, // no .env file here in CI; --env-file is not used by this command
    env: { PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
    timeout: 20_000,
  });
}

// The child process is given 20 s (spawnSync timeout); give the test itself more than that.
describe("process startup", { timeout: 30_000 }, () => {
  it("exits non-zero and names every missing variable when configuration is absent", () => {
    const result = boot({});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid configuration");
    for (const name of ["NODE_ENV", "DATABASE_URL", "WEB_ORIGIN"]) {
      expect(result.stderr).toContain(name);
    }
  });

  it("never prints the value of an invalid variable", () => {
    const secret = "topsecret-passw0rd";
    const result = boot({
      NODE_ENV: "production",
      DATABASE_URL: `mysql://root:${secret}@db.internal/x`,
      WEB_ORIGIN: "http://localhost:5173",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DATABASE_URL");
    expect(result.stderr).not.toContain(secret);
    expect(result.stdout).not.toContain(secret);
  });
});
