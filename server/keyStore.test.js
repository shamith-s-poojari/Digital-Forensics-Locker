import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createRoleGate } from "./chainRoles.js";
import { createKeyStore, parseMasterKey } from "./keyStore.js";
import { readFile, writeFile } from "node:fs/promises";
import { backends, fileBackend, useBackend } from "./storage/testBackends.js";

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

let harness;

/** roleOf: returns the signed-in wallet's on-chain role flags at the time of each call; omitted = no role checks. */
/**
 * evidence: id -> { sha256, branchId } on the "ledger" (omitted = no contract, releases not bound to a record).
 * scope: the caller's branch scope.
 */
function setup({ masterKey = randomBytes(32), masterKeyVersion = 1, roleOf, evidence, scope } = {}) {
  const storage = harness.newStorage().keys;
  const store = createKeyStore({
    masterKey,
    masterKeyVersion,
    storage,
    getSession: (req) => (req.signedIn ? { address: ALICE } : null),
    // A fresh gate per call, so a role change in the test is seen at once (no cache).
    checkRole: roleOf ? (session, capability) => createRoleGate({ readRoles: async () => roleOf() }).check(session, capability) : undefined,
    readEvidence: evidence ? async (id) => evidence[id] ?? null : undefined,
    readScope: scope ? async () => scope : undefined,
    now: () => Date.parse("2026-10-26T12:00:00.000Z"),
  });
  async function call(options) {
    const res = makeRes();
    const handled = await store.handle(makeReq(options), res);
    return { handled, status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  }
  const put = (body = { keyId: KEY_ID, sha256: SHA, key: RAW_KEY }, extra = {}) => call({ method: "POST", url: "/api/keys", body, ...extra });
  const get = (keyId = KEY_ID, extra = {}) => call({ url: `/api/keys/${keyId}`, ...extra });
  return { store, storage, call, put, get, masterKey };
}

describe("parseMasterKey", () => {
  it("accepts exactly 32 bytes of base64 and nothing else", () => {
    expect(parseMasterKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(parseMasterKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseMasterKey("")).toBeNull();
    expect(parseMasterKey(undefined)).toBeNull();
  });
});

describe.each(backends)("createKeyStore with on-chain roles ($name)", (backend) => {
  useBackend(backend, (h) => (harness = h));

  it("stores keys only for Investigators and releases them only to wallets that hold a role", async () => {
    let role = {};
    const { put, get, storage } = setup({ roleOf: () => role });

    expect((await put()).status).toBe(403); // no role
    role = { isAuditor: true };
    expect((await put()).status).toBe(403); // auditors cannot register evidence
    role = { isInvestigator: true };
    expect((await put()).status).toBe(201);

    role = {};
    const refused = await get();
    expect(refused.status).toBe(403);
    expect(refused.json.key).toBeUndefined();
    expect(await storage.listReleases()).toEqual([]); // nothing released, nothing logged

    role = { isAuditor: true };
    expect((await get()).json.key).toBe(RAW_KEY);
  });
});

describe.each(backends)("createKeyStore bound to the ledger ($name)", (backend) => {
  useBackend(backend, (h) => (harness = h));
  const OTHER_SHA = "cd".repeat(32);
  const ledger = { 7: { sha256: SHA, branchId: 1 }, 8: { sha256: OTHER_SHA, branchId: 1 }, 9: { sha256: SHA, branchId: 2 } };

  it("releases a key only for a named record that holds this file's hash, in the caller's branch", async () => {
    const { put, get, storage } = setup({ evidence: ledger, scope: { global: false, branchId: 1 } });
    await put();

    expect((await get()).status).toBe(400); // no record named
    expect((await get(`${KEY_ID}?evidence=abc`)).status).toBe(400);
    expect((await get(`${KEY_ID}?evidence=99`)).status).toBe(404); // not on the ledger
    expect((await get(`${KEY_ID}?evidence=8`)).status).toBe(409); // another file's record
    const otherBranch = await get(`${KEY_ID}?evidence=9`);
    expect(otherBranch.status).toBe(403);
    expect(otherBranch.json.key).toBeUndefined();
    expect(await storage.listReleases()).toEqual([]); // refusals release and log nothing

    expect((await get(`${KEY_ID}?evidence=7`)).json.key).toBe(RAW_KEY);
    expect(await storage.listReleases()).toEqual([expect.objectContaining({ keyId: KEY_ID, sha256: SHA, address: ALICE })]);
  });

  it("lets the Chief (every branch) open any branch's record", async () => {
    const { put, get } = setup({ evidence: ledger, scope: { global: true, branchId: null } });
    await put();
    expect((await get(`${KEY_ID}?evidence=9`)).json.key).toBe(RAW_KEY);
  });

  it("refuses when the ledger cannot be read", async () => {
    const rpcDown = new Proxy(
      {},
      {
        get() {
          throw new Error("RPC down");
        },
      },
    );
    const { put, get, storage } = setup({ evidence: rpcDown, scope: { global: true } });
    await put();
    expect((await get(`${KEY_ID}?evidence=7`)).status).toBe(503);
    expect(await storage.listReleases()).toEqual([]);
  });

  it("lists who decrypted a record, only within the caller's branch", async () => {
    const mine = setup({ evidence: ledger, scope: { global: false, branchId: 1 } });
    await mine.put();
    await mine.get(`${KEY_ID}?evidence=7`);
    await mine.get(`${KEY_ID}?evidence=7`);

    const list = await mine.call({ url: "/api/keys/releases?evidence=7" });
    expect(list.status).toBe(200);
    expect(list.json.releases).toEqual([
      { address: ALICE, at: "2026-10-26T12:00:00.000Z" },
      { address: ALICE, at: "2026-10-26T12:00:00.000Z" },
    ]);
    expect((await mine.call({ url: "/api/keys/releases?evidence=8" })).json.releases).toEqual([]);
    expect((await mine.call({ url: "/api/keys/releases?evidence=9" })).status).toBe(403);
  });
});

describe.each(backends)("createKeyStore ($name)", (backend) => {
  useBackend(backend, (h) => (harness = h));

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

  it("stores only the wrapped key, never the raw key", async () => {
    const { put, storage } = setup();
    await put();
    const entry = await storage.get(KEY_ID);

    expect(JSON.stringify(entry)).not.toContain(RAW_KEY);
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

  it("without a contract, lists releases by the hash the caller gives", async () => {
    const { put, get, call } = setup();
    await put();
    await get(`${KEY_ID}?evidence=3`);
    expect((await call({ url: `/api/keys/releases?evidence=3&sha256=${SHA}` })).json.releases).toEqual([{ address: ALICE, at: "2026-10-26T12:00:00.000Z" }]);
    expect((await call({ url: "/api/keys/releases?evidence=3" })).status).toBe(400);
  });

  it("logs every key release", async () => {
    const { put, get, storage } = setup();
    await put();
    await get();
    await get();
    expect(await storage.listReleases()).toEqual([
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

describe("createKeyStore on file storage", () => {
  useBackend(fileBackend, (h) => (harness = h));

  it("detects an entry edited on disk (its file hash changed), because the hash is bound into the wrap", async () => {
    const first = setup();
    await first.put();
    const { keyFile } = harness.paths;
    const data = JSON.parse(await readFile(keyFile, "utf8"));
    data.keys[KEY_ID].sha256 = "cd".repeat(32);
    await writeFile(keyFile, JSON.stringify(data));

    const result = await setup({ masterKey: first.masterKey }).get();
    expect(result.status).toBe(500);
  });
});
