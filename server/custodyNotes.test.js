import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { computeNoteHash, MAX_NOTE_LENGTH } from "../src/custody/custodyNote.js";
import { createRoleGate } from "./chainRoles.js";
import { createCustodyNoteStore } from "./custodyNotes.js";
import { backends, useBackend } from "./storage/testBackends.js";

const HOST = "localhost:5173";
const ALICE = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const AT = "2026-11-04T09:00:00.000Z";

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

let harness;

/** roleOf: returns the signed-in wallet's on-chain role flags at the time of each call; omitted = no role checks. */
function setup({ roleOf } = {}) {
  const gate = () => createRoleGate({ readRoles: async () => roleOf() });
  const store = createCustodyNoteStore({
    storage: harness.newStorage().custodyNotes,
    getSession: (req) => (req.signedIn ? { address: ALICE } : null),
    checkRole: roleOf ? (session, capability) => gate().check(session, capability) : undefined,
    readScope: roleOf ? (session) => gate().scope(session) : undefined,
    now: () => Date.parse(AT),
  });
  async function call(options) {
    const res = makeRes();
    const handled = await store.handle(makeReq(options), res);
    return { handled, status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  }
  const add = (body = { evidenceId: 7, note: "  Opened the sealed bag  " }, options = {}) => call({ method: "POST", url: "/api/custody-notes", body, ...options });
  const list = (evidence = 7) => call({ url: `/api/custody-notes?evidence=${evidence}` });
  return { call, add, list };
}

describe.each(backends)("createCustodyNoteStore ($name)", (backend) => {
  useBackend(backend, (h) => (harness = h));

  it("saves a note under the signed-in wallet, with a hash its own fields reproduce", async () => {
    const { add, list } = setup();
    const { status, json } = await add({ evidenceId: 7, note: "  Opened the sealed bag  ", author: "0xForged" });

    expect(status).toBe(201);
    expect(json).toMatchObject({ evidenceId: 7, note: "Opened the sealed bag", author: ALICE, createdAt: AT });
    expect(json.noteHash).toBe(computeNoteHash({ evidenceId: 7, author: ALICE, note: "Opened the sealed bag", salt: json.salt }));
    expect((await list()).json.notes).toEqual([json]);
    expect((await list(8)).json.notes).toEqual([]);
  });

  it("gives the same text a different hash each time, so a guess cannot be confirmed", async () => {
    const { add } = setup();
    const [first, second] = [await add(), await add()];
    expect(first.json.noteHash).not.toBe(second.json.noteHash);
  });

  it("refuses bad input", async () => {
    const { add, call } = setup();
    expect((await add({ evidenceId: 0, note: "x" })).status).toBe(400);
    expect((await add({ evidenceId: "7", note: "x" })).status).toBe(400);
    expect((await add({ evidenceId: 7, note: "   " })).status).toBe(400);
    expect((await add({ evidenceId: 7, note: "a\0b" })).status).toBe(400);
    expect((await add({ evidenceId: 7, note: "x".repeat(MAX_NOTE_LENGTH + 1) })).status).toBe(400);
    expect((await add({ evidenceId: 7, note: "x", branchId: "1" })).status).toBe(400);
    expect((await add("not json")).status).toBe(400);
    expect((await call({ url: "/api/custody-notes" })).status).toBe(400);
    expect((await call({ url: "/api/custody-notes?evidence=abc" })).status).toBe(400);
  });

  it("needs a sign-in and a same-site request, has no edit or delete, and ignores other paths", async () => {
    const { add, call } = setup();
    expect((await add(undefined, { signedIn: false })).status).toBe(401);
    expect((await add(undefined, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await call({ method: "DELETE", url: "/api/custody-notes" })).status).toBe(405);
    expect((await call({ method: "PUT", url: "/api/custody-notes" })).status).toBe(405);
    expect((await call({ url: "/api/cases" })).handled).toBe(false);
  });

  it("lets Investigators and the Chief add notes, and only readers with a role read them", async () => {
    let role = { isInvestigator: true, branchId: 1 };
    const { add, list } = setup({ roleOf: () => role });
    expect((await add()).status).toBe(201);

    role = { isChief: true };
    expect((await add({ evidenceId: 7, note: "Reassigned", branchId: 1 })).status).toBe(201);

    role = { isAuditor: true, branchId: 1 };
    expect((await add()).status).toBe(403);
    expect((await list()).json.notes).toHaveLength(2);

    role = { isAdmin: true, branchId: 1 };
    expect((await add()).status).toBe(403);

    role = {};
    expect((await add()).status).toBe(403);
    expect((await list()).status).toBe(403);
  });

  it("keeps a note inside its branch, and takes an Investigator's branch from the chain, not the request", async () => {
    let role = { isInvestigator: true, branchId: 1 };
    const { add, list } = setup({ roleOf: () => role });
    expect((await add({ evidenceId: 7, note: "Mine", branchId: 2 })).json.branchId).toBe(1);

    role = { isInvestigator: true, branchId: 2 };
    expect((await list()).json.notes).toEqual([]);

    role = { isChief: true };
    expect((await list()).json.notes).toHaveLength(1);
    expect((await add({ evidenceId: 7, note: "For branch 2", branchId: 2 })).json.branchId).toBe(2);

    role = { isInvestigator: true, branchId: 2 };
    expect((await list()).json.notes.map((n) => n.note)).toEqual(["For branch 2"]);
  });

  it("refuses an Investigator with no branch", async () => {
    const { add } = setup({ roleOf: () => ({ isInvestigator: true, branchId: 0 }) });
    expect((await add()).status).toBe(403);
  });
});
