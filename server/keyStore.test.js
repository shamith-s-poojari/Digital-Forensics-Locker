import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKeyStore, parseMasterKey } from "./keyStore.js";

const HOST = "localhost:5173";
const ALICE = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const KEY_ID = "0123456789abcdef0123456789abcdef";
const SHA = "ab".repeat(32);
const RAW_KEY = randomBytes(32).toString("base64");

function makeReq({ method = "GET", url, headers = {}, body, signedIn = true } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { host: HOST, origin: `http://${HOST}`, "x-requested-with": "forensics-locker", ...headers };
  req.signedIn = signedIn;
  return req;
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(chunk) {
      this.body = chunk ?? "";
    },
  };
}

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "dfl-keys-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function setup({ masterKey = randomBytes(32), masterKeyVersion = 1 } = {}) {
  const filePath = join(dir, "keys.json");
  const accessLogPath = join(dir, "access.log");
  const store = createKeyStore({
    masterKey,
    masterKeyVersion,
    filePath,
    accessLogPath,
    getSession: (req) => (req.signedIn ? { address: ALICE } : null),
    now: () => Date.parse("2026-10-26T12:00:00.000Z"),
  });
  async function call(options) {
    const res = makeRes();
    const handled = await store.handle(makeReq(options), res);
    return { handled, status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  }
  const put = (body = { keyId: KEY_ID, sha256: SHA, key: RAW_KEY }, extra = {}) => call({ method: "POST", url: "/api/keys", body, ...extra });
  const get = (keyId = KEY_ID, extra = {}) => call({ url: `/api/keys/${keyId}`, ...extra });
  return { store, call, put, get, filePath, accessLogPath, masterKey };
}

describe("parseMasterKey", () => {
  it("accepts exactly 32 bytes of base64 and nothing else", () => {
    expect(parseMasterKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(parseMasterKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseMasterKey("")).toBeNull();
    expect(parseMasterKey(undefined)).toBeNull();
  });
});

describe("createKeyStore", () => {
  it("ignores other paths", async () => {
    expect((await setup().call({ url: "/api/pin" })).handled).toBe(false);
  });

  it("explains how to configure the master key when it is missing, and stores nothing", async () => {
    const { put } = setup({ masterKey: null });
    const result = await put();
    expect(result.status).toBe(503);
    expect(result.json.error).toMatch(/EVIDENCE_MASTER_KEY/);
  });

  it("requires a wallet sign-in for both storing and fetching", async () => {
    const { put, get } = setup();
    expect((await put(undefined, { signedIn: false })).status).toBe(401);
    expect((await get(KEY_ID, { signedIn: false })).status).toBe(401);
  });

  it("refuses cross-site requests", async () => {
    const { put, get } = setup();
    expect((await put(undefined, { headers: { "x-requested-with": undefined } })).status).toBe(403);
    expect((await get(KEY_ID, { headers: { origin: "https://evil.example" } })).status).toBe(403);
  });

  it("stores a key and gives it back, with who stored it", async () => {
    const { put, get } = setup();
    expect((await put()).status).toBe(201);

    const result = await get();
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ keyId: KEY_ID, sha256: SHA, key: RAW_KEY, createdBy: ALICE, createdAt: "2026-10-26T12:00:00.000Z" });
  });

  it("writes only the wrapped key to disk, never the raw key", async () => {
    const { put, filePath } = setup();
    await put();
    const text = await readFile(filePath, "utf8");
    const entry = JSON.parse(text).keys[KEY_ID];

    expect(text).not.toContain(RAW_KEY);
    expect(entry).toMatchObject({ keyId: KEY_ID, sha256: SHA, masterKeyVersion: 1, createdBy: ALICE });
    expect(entry.wrapped).not.toBe(RAW_KEY);
  });

  it("never replaces a stored key", async () => {
    const { put, get } = setup();
    await put();
    const other = randomBytes(32).toString("base64");
    expect((await put({ keyId: KEY_ID, sha256: SHA, key: other })).status).toBe(409);
    expect((await get()).json.key).toBe(RAW_KEY);
  });

  it("logs every key release", async () => {
    const { put, get, accessLogPath } = setup();
    await put();
    await get();
    await get();
    const lines = (await readFile(accessLogPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { keyId: KEY_ID, sha256: SHA, address: ALICE, at: "2026-10-26T12:00:00.000Z" },
      { keyId: KEY_ID, sha256: SHA, address: ALICE, at: "2026-10-26T12:00:00.000Z" },
    ]);
  });

  it("keeps keys across restarts (a new store over the same file and master key)", async () => {
    const first = setup();
    await first.put();
    const second = setup({ masterKey: first.masterKey });
    expect((await second.get()).json.key).toBe(RAW_KEY);
  });

  it("will not unwrap with a different master key", async () => {
    const first = setup();
    await first.put();
    const result = await setup().get();
    expect(result.status).toBe(500);
    expect(result.json.error).toMatch(/could not be unwrapped/);
  });

  it("detects an entry edited on disk (its file hash changed), because the hash is bound into the wrap", async () => {
    const first = setup();
    await first.put();
    const data = JSON.parse(await readFile(first.filePath, "utf8"));
    data.keys[KEY_ID].sha256 = "cd".repeat(32);
    await writeFile(first.filePath, JSON.stringify(data));

    const result = await setup({ masterKey: first.masterKey }).get();
    expect(result.status).toBe(500);
  });

  it("refuses a key wrapped under a master key version that is not loaded", async () => {
    const first = setup({ masterKeyVersion: 1 });
    await first.put();
    const result = await setup({ masterKey: first.masterKey, masterKeyVersion: 2 }).get();
    expect(result.status).toBe(503);
    expect(result.json.error).toMatch(/version 1/);
  });

  it("validates input", async () => {
    const { put, get } = setup();
    expect((await put({ keyId: "short", sha256: SHA, key: RAW_KEY })).status).toBe(400);
    expect((await put({ keyId: KEY_ID, sha256: "zz", key: RAW_KEY })).status).toBe(400);
    expect((await put({ keyId: KEY_ID, sha256: SHA, key: randomBytes(16).toString("base64") })).status).toBe(400);
    expect((await put("not json")).status).toBe(400);
    expect((await get("../../etc/passwd")).status).toBe(400);
    expect((await get("f".repeat(32))).status).toBe(404);
  });
});
