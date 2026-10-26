import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for a real leak: reading `import.meta.env` as a whole object makes Vite inline every VITE_*
 * variable from .env (including any secret ever stored there) into the public JavaScript bundle. Reading single
 * properties (`import.meta.env.VITE_LOCKER_ADDRESS`) is safe, because only that one value is inlined.
 */

const SRC = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(js|jsx)$/.test(name) && !/\.test\./.test(name)) yield path;
  }
}

describe("import.meta.env usage", () => {
  it("never reads the env object as a whole (only named properties)", () => {
    const offenders = [];
    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) return; // comment lines may mention the pattern
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        // `import.meta.env` NOT followed by `.name` or `["name"]`
        if (/import\.meta\.env(?!\s*\.\s*[A-Za-z_]|\s*\[)/.test(code)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `bare import.meta.env found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the check itself catches the bad pattern (so this test cannot silently pass)", () => {
    const bad = /import\.meta\.env(?!\s*\.\s*[A-Za-z_]|\s*\[)/;
    expect(bad.test("function f(env = import.meta.env) {}")).toBe(true);
    expect(bad.test("const all = { ...import.meta.env };")).toBe(true);
    expect(bad.test("Object.keys(import.meta.env)")).toBe(true);
    expect(bad.test("const a = import.meta.env.VITE_LOCKER_ADDRESS;")).toBe(false);
    expect(bad.test("const a = import.meta.env.DEV;")).toBe(false);
  });
});
