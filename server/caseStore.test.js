import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeCaseDigest } from "../src/cases/caseDigest.js";
import { deriveCaseRef } from "../src/web3/format.js";
import { createCaseStore } from "./caseStore.js";
import { createRoleGate } from "./chainRoles.js";

const HOST = "localhost:5173";
const ALICE = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const CASE_REF = deriveCaseRef("CASE-2026-0001");

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
    body: "",
    setHeader() {},
    end(chunk) {
      this.body = chunk ?? "";
    },
  };
}

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "dfl-cases-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** roleOf: returns the signed-in wallet's on-chain role flags at the time of each call; omitted = no role checks. */
function setup({ roleOf } = {}) {
  const filePath = join(dir, "cases.json");
  // A fresh gate per call, so the role in force is never a cached one.
  const gate = () => createRoleGate({ readRoles: async () => roleOf() });
  const store = createCaseStore({
    filePath,
    getSession: (req) => (req.signedIn ? { address: ALICE } : null),
    checkRole: roleOf ? (session, capability) => gate().check(session, capability) : undefined,
    readScope: roleOf ? (session) => gate().scope(session) : undefined,
    now: () => Date.parse("2026-10-27T09:00:00.000Z"),
  });
  async function call(options) {
    const res = makeRes();
    const handled = await store.handle(makeReq(options), res);
    return { handled, status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  }
  const create = (body = { caseNumber: "case-2026-0001", title: "  Phishing ring  ", description: "Initial report" }) => call({ method: "POST", url: "/api/cases", body });
  const edit = (body, caseRef = CASE_REF) => call({ method: "POST", url: `/api/cases/${caseRef}/versions`, body });
  return { call, create, edit, filePath };
}

describe("createCaseStore with on-chain roles", () => {
  it("lets any role read cases, only Investigators create and edit them, and nobody without a role see them", async () => {
    let role = { isInvestigator: true, branchId: 1 };
    const { call, create, edit } = setup({ roleOf: () => role });
    expect((await create()).status).toBe(201);

    role = { isAuditor: true, branchId: 1 };
    expect((await call({ url: "/api/cases" })).json.cases).toHaveLength(1);
    expect((await call({ url: `/api/cases/${CASE_REF}` })).status).toBe(200);
    expect((await edit({ title: "Changed", description: "" })).status).toBe(403);

    role = { isChief: true };
    expect((await create({ caseNumber: "case-2", title: "t", description: "" })).status).toBe(403); // separation of duties

    role = {};
    expect((await call({ url: "/api/cases" })).status).toBe(403);
  });

  it("tags a case with its creator's branch and hides it from other branches, but not from the Chief", async () => {
    let role = { isInvestigator: true, branchId: 1 };
    const { call, create, edit } = setup({ roleOf: () => role });
    expect((await create()).json.branchId).toBe(1);

    role = { isInvestigator: true, branchId: 2 };
    expect((await call({ url: "/api/cases" })).json.cases).toHaveLength(0);
    expect((await call({ url: `/api/cases/${CASE_REF}` })).status).toBe(404);
    expect((await edit({ title: "Hijacked", description: "" })).status).toBe(404);
    expect((await create()).status).toBe(409); // the case number is still taken, whichever branch holds it

    role = { isChief: true };
    expect((await call({ url: "/api/cases" })).json.cases.map((c) => c.branchId)).toEqual([1]);
    expect((await call({ url: `/api/cases/${CASE_REF}` })).json.versions).toHaveLength(1);
  });
});

describe("createCaseStore", () => {
  it("ignores other paths", async () => {
    expect((await setup().call({ url: "/api/keys" })).handled).toBe(false);
  });

  it("requires a sign-in and refuses cross-site requests", async () => {
    const { call } = setup();
    expect((await call({ url: "/api/cases", signedIn: false })).status).toBe(401);
    expect((await call({ url: "/api/cases", headers: { "x-requested-with": undefined } })).status).toBe(403);
  });

  it("creates a case with version 1, a normalised case number, the derived reference and a correct digest", async () => {
    const { create } = setup();
    const { status, json } = await create();

    expect(status).toBe(201);
    expect(json).toMatchObject({ caseRef: CASE_REF, caseNumber: "CASE-2026-0001", createdBy: ALICE });
    const [v1] = json.versions;
    expect(v1).toMatchObject({ version: 1, title: "Phishing ring", description: "Initial report", editedBy: ALICE });
    expect(v1.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(v1.digest).toBe(computeCaseDigest({ caseRef: CASE_REF, caseNumber: "CASE-2026-0001", title: "Phishing ring", description: "Initial report", salt: v1.salt }));
  });

  it("refuses a duplicate case and missing or over-long fields", async () => {
    const { create } = setup();
    await create();
    expect((await create()).status).toBe(409);
    expect((await create({ caseNumber: "C-2", title: "" })).status).toBe(400);
    expect((await create({ caseNumber: "", title: "x" })).status).toBe(400);
    expect((await create({ caseNumber: "C-3", title: "x".repeat(201) })).status).toBe(400);
  });

  it("appends versions on edit and never changes an earlier one", async () => {
    const { create, edit, call } = setup();
    const v1 = (await create()).json.versions[0];

    const edited = await edit({ title: "Phishing ring (Bank A)", description: "Updated after interviews" });
    expect(edited.status).toBe(201);
    expect(edited.json.versions).toHaveLength(2);
    expect(edited.json.versions[0]).toEqual(v1);
    expect(edited.json.versions[1]).toMatchObject({ version: 2, title: "Phishing ring (Bank A)" });
    expect(edited.json.versions[1].salt).not.toBe(v1.salt);

    // An edit that changes nothing adds nothing.
    expect((await edit({ title: "Phishing ring (Bank A)", description: "Updated after interviews" })).json.versions).toHaveLength(2);
    expect((await call({ url: `/api/cases/${CASE_REF}` })).json.versions).toHaveLength(2);
  });

  it("lists cases and persists them across restarts", async () => {
    const first = setup();
    await first.create();
    const second = setup();
    const { json } = await second.call({ url: "/api/cases" });
    expect(json.cases.map((c) => c.caseRef)).toEqual([CASE_REF]);
    expect(JSON.parse(await readFile(first.filePath, "utf8")).cases[CASE_REF].versions).toHaveLength(1);
  });

  it("validates references and reports unknown cases", async () => {
    const { call, edit } = setup();
    expect((await call({ url: "/api/cases/not-a-ref" })).status).toBe(400);
    expect((await call({ url: `/api/cases/0x${"ab".repeat(32)}` })).status).toBe(404);
    expect((await edit({ title: "x" }, `0x${"ab".repeat(32)}`)).status).toBe(404);
    expect((await call({ method: "DELETE", url: `/api/cases/${CASE_REF}` })).status).toBe(405);
  });
});
