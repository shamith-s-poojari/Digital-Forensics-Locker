// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeSHA256, formatFileSize } from "./hash";
import { mockEvidence } from "../data/mockData";

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

// Multi-byte (UTF-8, 32 bytes) input. The expected digest was produced with
// node:crypto: createHash("sha256").update(MULTIBYTE_TEXT, "utf8").digest("hex").
const MULTIBYTE_TEXT = "héllo wörld ✓ 日本語 🔒";
const MULTIBYTE_SHA256 = "04baf066573ebf22e2a59c25d35279cc8a09de476511df50dc5138750363fb43";

const nodeSha256 = (data) => createHash("sha256").update(data).digest("hex");

describe("computeSHA256", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hashes empty input to the well-known empty-string digest", async () => {
    expect(await computeSHA256(new File([], "empty.bin"))).toBe(EMPTY_SHA256);
  });

  it('hashes "abc" to the NIST test vector', async () => {
    expect(await computeSHA256(new File(["abc"], "abc.txt"))).toBe(ABC_SHA256);
  });

  it("hashes multi-byte UTF-8 content to a known digest that node:crypto agrees with", async () => {
    const digest = await computeSHA256(new File([MULTIBYTE_TEXT], "unicode.txt"));
    expect(digest).toBe(MULTIBYTE_SHA256);
    expect(digest).toBe(nodeSha256(Buffer.from(MULTIBYTE_TEXT, "utf8")));
  });

  it("hashes arbitrary binary data identically to node:crypto", async () => {
    const bytes = randomBytes(1024 * 1024 + 17);
    expect(await computeSHA256(new File([bytes], "random.bin"))).toBe(nodeSha256(bytes));
  });

  it("returns a lowercase 64-character hex string", async () => {
    const digest = await computeSHA256(new File(["any content"], "x.txt"));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is sensitive to a single-byte change", async () => {
    const a = await computeSHA256(new File(["evidence-A"], "a.txt"));
    const b = await computeSHA256(new File(["evidence-B"], "b.txt"));
    expect(a).not.toBe(b);
  });

  it("rejects with a clear error when Web Crypto is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(computeSHA256(new File(["abc"], "abc.txt"))).rejects.toThrow(/secure context/i);
  });

  it("rejects with a readable error when the file cannot be read", async () => {
    const unreadable = {
      arrayBuffer: () => Promise.reject(new Error("disk went away")),
    };
    await expect(computeSHA256(unreadable)).rejects.toThrow(/Could not read file: disk went away/);
  });
});

describe("formatFileSize", () => {
  it("formats values under 1 KiB as whole bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1)).toBe("1 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("formats kilobytes with two decimals", () => {
    expect(formatFileSize(1024)).toBe("1.00 KB");
    expect(formatFileSize(1536)).toBe("1.50 KB");
    expect(formatFileSize(512 * 1024)).toBe("512.00 KB");
  });

  it("formats megabytes and gigabytes with two decimals", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.00 MB");
    expect(formatFileSize(Math.round(3.47 * 1024 * 1024))).toBe("3.47 MB");
    expect(formatFileSize(1024 ** 3)).toBe("1.00 GB");
  });

  it("does not print 1024.00 of a unit when rounding crosses a boundary", () => {
    expect(formatFileSize(1024 * 1024 - 1)).toBe("1.00 MB");
  });

  it("treats invalid input as 0 B", () => {
    expect(formatFileSize(-5)).toBe("0 B");
    expect(formatFileSize(NaN)).toBe("0 B");
    expect(formatFileSize(undefined)).toBe("0 B");
    expect(formatFileSize(null)).toBe("0 B");
    expect(formatFileSize("12")).toBe("0 B");
  });
});

describe("mockEvidence", () => {
  it("has at least one entry", () => {
    expect(mockEvidence.length).toBeGreaterThan(0);
  });

  it.each(mockEvidence.map((e) => [e.id, e.hash]))(
    "%s has a valid 64-character lowercase hex hash",
    (_id, hash) => {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
  );

  it("has no duplicate evidence ids or hashes", () => {
    expect(new Set(mockEvidence.map((e) => e.id)).size).toBe(mockEvidence.length);
    expect(new Set(mockEvidence.map((e) => e.hash)).size).toBe(mockEvidence.length);
  });
});
