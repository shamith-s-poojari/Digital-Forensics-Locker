// What the store suites (server/caseStore.test.js and friends) cannot see from the API: the file format, and how
// Postgres behaves underneath. Those suites already run against both backends.
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createKeyStore } from "../keyStore.js";
import { MIGRATIONS } from "./schema.js";
import { backends, fileBackend, postgresBackend, useBackend } from "./testBackends.js";

const ALICE = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const AT = "2026-11-04T09:00:00.000Z";
const KEY_ID = "0123456789abcdef0123456789abcdef";
const SHA = "ab".repeat(32);

const version = (number, title = "Title") => ({ version: number, title, description: "", salt: "s".repeat(64), digest: "d".repeat(64), editedBy: ALICE, editedAt: AT });
const makeCase = (caseRef = "0xcase") => ({ caseRef, caseNumber: "C-1", branchId: 1, createdBy: ALICE, createdAt: AT, versions: [version(1)] });
const makeRequest = (id, address = ALICE, status = "pending") => ({ id, address, role: "auditor", branchId: 2 ** 32, reason: "", status, createdAt: AT, resolvedBy: null, resolvedAt: null });
const makeKey = (keyId = KEY_ID) => ({ keyId, sha256: SHA, masterKeyVersion: 1, iv: "iv", wrapped: "wrapped", tag: "tag", createdBy: ALICE, createdAt: AT });
const makeRelease = () => ({ keyId: KEY_ID, sha256: SHA, address: ALICE, at: AT });
const makeNote = (noteHash = "aa".repeat(32), evidenceId = 7) => ({ noteHash, evidenceId, branchId: 1, note: "Sealed bag opened", salt: "s".repeat(64), author: ALICE, createdAt: AT });

let harness;

describe.each(backends)("storage operations ($name)", (backend) => {
  useBackend(backend, (h) => (harness = h));

  it("returns a case exactly as it was stored, keeping the order cases were added", async () => {
    const { cases } = harness.newStorage();
    expect(await cases.insert(makeCase("0xb"))).toBe(true);
    expect(await cases.insert(makeCase("0xa"))).toBe(true);
    expect(await cases.get("0xb")).toEqual(makeCase("0xb"));
    expect(await cases.get("0xmissing")).toBeNull();
    expect((await cases.list()).map((c) => c.caseRef)).toEqual(["0xb", "0xa"]);
  });

  it("keeps text exactly, since on-chain digests are computed over it", async () => {
    const { cases } = harness.newStorage();
    const title = "केस ₹500 — Ünï 🔍 'quoted' \"double\" \\ back";
    await cases.insert({ ...makeCase(), versions: [version(1, title)] });
    expect((await harness.newStorage().cases.get("0xcase")).versions[0].title).toBe(title);
  });

  it("refuses a taken case reference, and a version number that is not the next one", async () => {
    const { cases } = harness.newStorage();
    await cases.insert(makeCase());
    expect(await cases.insert(makeCase())).toBe(false);
    expect((await cases.appendVersion("0xcase", version(2))).versions).toHaveLength(2);
    expect(await cases.appendVersion("0xcase", version(2, "A lost race"))).toBeNull();
    expect((await cases.get("0xcase")).versions[1].title).toBe("Title");
  });

  it("keeps one pending request per wallet whatever the address's letter case, and keeps decided ones", async () => {
    const { accessRequests } = harness.newStorage();
    await accessRequests.replacePending(makeRequest("1"));
    await accessRequests.resolve("1", { status: "rejected", resolvedBy: ALICE, resolvedAt: AT });
    await accessRequests.replacePending(makeRequest("2"));
    await accessRequests.replacePending(makeRequest("3", ALICE.toLowerCase()));

    expect((await accessRequests.list()).map((r) => r.id)).toEqual(["1", "3"]);
    expect((await accessRequests.listPending()).map((r) => r.id)).toEqual(["3"]);
    expect((await accessRequests.latestFor(ALICE)).id).toBe("3");
    expect(await accessRequests.latestFor("0x0")).toBeNull();
    expect(await accessRequests.get("3")).toEqual(makeRequest("3", ALICE.toLowerCase()));
    expect(await accessRequests.get("1")).toMatchObject({ status: "rejected", resolvedBy: ALICE, resolvedAt: AT });
  });

  it("resolves a request only while it is pending: a decision is never overwritten", async () => {
    const { accessRequests } = harness.newStorage();
    await accessRequests.replacePending(makeRequest("1"));
    expect(await accessRequests.resolve("1", { status: "rejected", resolvedBy: ALICE, resolvedAt: AT })).toMatchObject({ status: "rejected" });
    expect(await accessRequests.resolve("1", { status: "approved", resolvedBy: "0xMallory", resolvedAt: AT })).toBeNull();
    expect(await accessRequests.resolve("missing", { status: "approved", resolvedBy: ALICE, resolvedAt: AT })).toBeNull();
    expect(await accessRequests.get("1")).toMatchObject({ status: "rejected", resolvedBy: ALICE });
  });

  it("never replaces a key, and keeps every release in order", async () => {
    const { keys } = harness.newStorage();
    expect(await keys.insert(makeKey())).toBe(true);
    expect(await keys.insert({ ...makeKey(), wrapped: "other" })).toBe(false);
    expect(await keys.get(KEY_ID)).toEqual(makeKey());
    expect(await keys.get("missing")).toBeNull();

    await keys.logRelease(makeRelease());
    await keys.logRelease({ ...makeRelease(), address: "0x2", evidenceId: 42 });
    // Every field comes back, including which evidence record the key was released for (none for the first row).
    expect(await keys.listReleases()).toEqual([makeRelease(), { ...makeRelease(), address: "0x2", evidenceId: 42 }]);
  });

  it("never replaces a custody note, and lists an evidence item's notes in order", async () => {
    const { custodyNotes } = harness.newStorage();
    expect(await custodyNotes.insert(makeNote("b".repeat(64)))).toBe(true);
    expect(await custodyNotes.insert(makeNote("a".repeat(64)))).toBe(true);
    expect(await custodyNotes.insert(makeNote("c".repeat(64), 8))).toBe(true);
    expect(await custodyNotes.insert({ ...makeNote("a".repeat(64)), note: "Rewritten" })).toBe(false);

    expect(await custodyNotes.listFor(7)).toEqual([makeNote("b".repeat(64)), makeNote("a".repeat(64))]);
    expect(await harness.newStorage().custodyNotes.listFor(9)).toEqual([]);
    expect(await custodyNotes.list()).toHaveLength(3);
  });

  it("hands out copies, so changing a record changes nothing stored", async () => {
    const { cases } = harness.newStorage();
    await cases.insert(makeCase());
    (await cases.get("0xcase")).versions[0].title = "Changed";
    expect((await cases.get("0xcase")).versions[0].title).toBe("Title");
  });

  it("keeps one role PIN entry per address, replacing it on change and keeping when it was first set", async () => {
    const { rolePins } = harness.newStorage();
    expect(await rolePins.get(ALICE)).toBeNull();
    await rolePins.put({ address: ALICE, salt: "aa", hash: "h1", createdAt: AT, updatedAt: AT });
    const later = "2026-11-05T09:00:00.000Z";
    await rolePins.put({ address: ALICE, salt: "bb", hash: "h2", createdAt: AT, updatedAt: later });
    expect(await harness.newStorage().rolePins.get(ALICE)).toEqual({ address: ALICE, salt: "bb", hash: "h2", createdAt: AT, updatedAt: later });
  });
});

describe("file storage", () => {
  useBackend(fileBackend, (h) => (harness = h));

  it("keeps the on-disk format, so an existing .data folder still loads", async () => {
    const storage = harness.newStorage();
    await storage.cases.insert(makeCase());
    await storage.accessRequests.replacePending(makeRequest("1"));
    await storage.keys.insert(makeKey());
    await storage.keys.logRelease(makeRelease());
    await storage.custodyNotes.insert(makeNote());

    const { paths } = harness;
    expect(JSON.parse(await readFile(paths.custodyNoteFile, "utf8"))).toEqual({ version: 1, notes: [makeNote()] });
    expect(JSON.parse(await readFile(paths.caseFile, "utf8"))).toEqual({ version: 1, cases: { "0xcase": makeCase() } });
    expect(JSON.parse(await readFile(paths.accessRequestFile, "utf8"))).toEqual({ version: 1, requests: [makeRequest("1")] });
    expect(JSON.parse(await readFile(paths.keyFile, "utf8"))).toEqual({ version: 1, keys: { [KEY_ID]: makeKey() } });
    expect(await readFile(paths.accessLogFile, "utf8")).toBe(`${JSON.stringify(makeRelease())}\n`);
  });

  it("refuses to replace an unreadable file with an empty store", async () => {
    await writeFile(harness.paths.caseFile, "not json");
    const { cases } = harness.newStorage();
    await expect(cases.list()).rejects.toThrow();
    await expect(cases.insert(makeCase())).rejects.toThrow();
    expect(await readFile(harness.paths.caseFile, "utf8")).toBe("not json");
  });
});

describe.runIf(process.env.TEST_DATABASE_URL)("postgres storage", () => {
  useBackend(postgresBackend, (h) => (harness = h));

  it("applies each migration once, even when two servers start together", async () => {
    const [first, second] = [harness.newStorage(), harness.newStorage()];
    await Promise.all([first.ready(), second.ready()]);
    await harness.newStorage().ready();
    const { rows } = await harness.sql("SELECT name FROM schema_migrations");
    expect(rows.map((row) => row.name)).toEqual(MIGRATIONS.map((m) => m.name));
  });

  it.each([
    ["case_versions", "UPDATE case_versions SET title = 'x'"],
    ["case_versions", "DELETE FROM case_versions"],
    ["case_versions", "TRUNCATE case_versions CASCADE"],
    ["evidence_keys", "UPDATE evidence_keys SET wrapped = 'x'"],
    ["evidence_keys", "DELETE FROM evidence_keys"],
    ["evidence_keys", "TRUNCATE evidence_keys"],
    ["key_access_log", "UPDATE key_access_log SET address = 'x'"],
    ["key_access_log", "DELETE FROM key_access_log"],
    ["key_access_log", "TRUNCATE key_access_log"],
    ["custody_notes", "UPDATE custody_notes SET note = 'x'"],
    ["custody_notes", "DELETE FROM custody_notes"],
    ["custody_notes", "TRUNCATE custody_notes"],
  ])("refuses to change %s: %s", async (table, sql) => {
    const storage = harness.newStorage();
    await storage.custodyNotes.insert(makeNote());
    await storage.cases.insert(makeCase());
    await storage.keys.insert(makeKey());
    await storage.keys.logRelease(makeRelease());
    await expect(harness.sql(sql)).rejects.toThrow(`${table} is append-only`);
  });

  it("lets only one of two simultaneous edits take a version number", async () => {
    const { cases } = harness.newStorage();
    await cases.insert(makeCase());
    const results = await Promise.all([cases.appendVersion("0xcase", version(2, "A")), cases.appendVersion("0xcase", version(2, "B"))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await cases.get("0xcase")).versions).toHaveLength(2);
  });

  it("leaves one pending request when a wallet submits many at once", async () => {
    const { accessRequests } = harness.newStorage();
    await Promise.all(["1", "2", "3", "4"].map((id) => accessRequests.replacePending(makeRequest(id))));
    expect(await accessRequests.listPending()).toHaveLength(1);
  });

  it("stores the case with all its versions or not at all", async () => {
    const { cases } = harness.newStorage();
    await expect(cases.insert({ ...makeCase(), versions: [version(1), { ...version(2), title: null }] })).rejects.toThrow();
    expect(await cases.get("0xcase")).toBeNull();
  });

  it("detects a stored key whose file hash was changed behind the API's back", async () => {
    const storage = harness.newStorage();
    const masterKey = randomBytes(32);
    const keyStore = createKeyStore({ masterKey, storage: storage.keys, getSession: () => ({ address: ALICE }) });
    const call = async (options) => {
      const req = Readable.from(options.body ? [Buffer.from(JSON.stringify(options.body))] : []);
      Object.assign(req, { method: options.method ?? "GET", url: options.url, headers: { host: "localhost:5173", origin: "http://localhost:5173", "x-requested-with": "forensics-locker" } });
      const res = { statusCode: 200, setHeader() {}, end() {} };
      await keyStore.handle(req, res);
      return res.statusCode;
    };
    expect(await call({ method: "POST", url: "/api/keys", body: { keyId: KEY_ID, sha256: SHA, key: randomBytes(32).toString("base64") } })).toBe(201);

    await harness.sql("ALTER TABLE evidence_keys DISABLE TRIGGER USER");
    await harness.sql(`UPDATE evidence_keys SET sha256 = '${"cd".repeat(32)}'`);
    await harness.sql("ALTER TABLE evidence_keys ENABLE TRIGGER USER");

    expect(await call({ url: `/api/keys/${KEY_ID}` })).toBe(500);
    expect(await storage.keys.listReleases()).toEqual([]); // nothing released, nothing logged
  });

  describe("importFrom", () => {
    async function fileSource() {
      const opened = await fileBackend.open();
      const source = opened.newStorage();
      await source.cases.insert(makeCase("0xb"));
      await source.cases.appendVersion("0xb", version(2));
      await source.cases.insert(makeCase("0xa"));
      await source.accessRequests.replacePending(makeRequest("1"));
      await source.accessRequests.resolve("1", { status: "approved", resolvedBy: ALICE, resolvedAt: AT });
      await source.accessRequests.replacePending(makeRequest("2", "0xBob"));
      await source.keys.insert(makeKey());
      await source.keys.logRelease({ ...makeRelease(), evidenceId: 7 });
      await source.custodyNotes.insert(makeNote());
      return { opened, source };
    }

    it("copies everything unchanged and in order, and a second run changes nothing", async () => {
      const { opened, source } = await fileSource();
      const target = harness.newStorage();
      try {
        expect(await target.importFrom(source)).toEqual({
          cases: { copied: 2, skipped: 0 },
          accessRequests: { copied: 2, skipped: 0 },
          keys: { copied: 1, skipped: 0 },
          custodyNotes: { copied: 1, skipped: 0 },
          keyReleases: { copied: 1, skipped: 0 },
        });
        expect(await target.custodyNotes.list()).toEqual(await source.custodyNotes.list());
        expect(await target.cases.list()).toEqual(await source.cases.list());
        expect(await target.accessRequests.list()).toEqual(await source.accessRequests.list());
        expect(await target.keys.list()).toEqual(await source.keys.list());
        expect(await target.keys.listReleases()).toEqual(await source.keys.listReleases());

        expect(await target.importFrom(source)).toEqual({
          cases: { copied: 0, skipped: 2 },
          accessRequests: { copied: 0, skipped: 2 },
          keys: { copied: 0, skipped: 1 },
          custodyNotes: { copied: 0, skipped: 1 },
          keyReleases: { copied: 0, skipped: 1 },
        });
        expect(await target.keys.listReleases()).toHaveLength(1);
      } finally {
        await opened.close();
      }
    });

    it("copies nothing if any record cannot be stored", async () => {
      const { opened, source } = await fileSource();
      const target = harness.newStorage();
      await target.accessRequests.replacePending(makeRequest("other", "0xBob")); // clashes with the source's pending "2"
      try {
        await expect(target.importFrom(source)).rejects.toThrow();
        expect(await target.cases.list()).toEqual([]);
        expect(await target.keys.list()).toEqual([]);
      } finally {
        await opened.close();
      }
    });
  });
});
