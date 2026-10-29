import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccessRequestStore } from "./accessRequests.js";
import { createRoleGate } from "./chainRoles.js";

const HOST = "localhost:5173";
const ALICE = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const CHIEF = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

function makeReq({ method = "GET", url, headers = {}, body, as = ALICE } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { host: HOST, origin: `http://${HOST}`, "x-requested-with": "forensics-locker", ...headers };
  req.as = as;
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
  dir = await mkdtemp(join(tmpdir(), "dfl-requests-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** @param {{ roles?: Record<string, object> }} [options] roles: on-chain role flags by address; omitted = no role checks */
function setup({ roles } = {}) {
  const filePath = join(dir, "access-requests.json");
  const checkRole = roles ? createRoleGate({ readRoles: async (address) => roles[address] ?? {} }).check : undefined;
  const store = createAccessRequestStore({ filePath, getSession: (req) => (req.as ? { address: req.as } : null), checkRole, now: () => Date.parse("2026-10-27T09:00:00.000Z") });
  async function call(options) {
    const res = makeRes();
    const handled = await store.handle(makeReq(options), res);
    return { handled, status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  }
  const submit = (body, as = ALICE) => call({ method: "POST", url: "/api/access-requests", body, as });
  return { call, submit, filePath };
}

describe("createAccessRequestStore", () => {
  it("ignores other paths", async () => {
    expect((await setup().call({ url: "/api/cases" })).handled).toBe(false);
  });

  it("requires a sign-in and refuses cross-site requests", async () => {
    const { call } = setup();
    expect((await call({ url: "/api/access-requests", as: null })).status).toBe(401);
    expect((await call({ url: "/api/access-requests", headers: { origin: "https://evil.example" } })).status).toBe(403);
  });

  it("records a request under the signed-in address, never one from the body", async () => {
    const { submit, call, filePath } = setup();
    const { status, json } = await submit({ role: "investigator", reason: "  Cyber   unit  ", address: CHIEF });
    expect(status).toBe(201);
    expect(json).toMatchObject({ address: ALICE, role: "investigator", reason: "Cyber unit", status: "pending" });

    expect((await call({ url: "/api/access-requests/mine" })).json.request.id).toBe(json.id);
    expect((await call({ url: "/api/access-requests" })).json.requests).toHaveLength(1);
    expect(JSON.parse(await readFile(filePath, "utf8")).requests[0].address).toBe(ALICE);
  });

  it("refuses the Chief seat, unknown roles and over-long reasons", async () => {
    const { submit } = setup();
    expect((await submit({ role: "chief" })).status).toBe(400); // the Chief seat moves only by transfer
    expect((await submit({ role: "superuser" })).status).toBe(400);
    expect((await submit({ role: "auditor", reason: "x".repeat(501) })).status).toBe(400);
    expect((await submit("not json")).status).toBe(400);
  });

  it("keeps one pending request per address: a new one replaces it", async () => {
    const { submit, call } = setup();
    await submit({ role: "auditor" });
    await submit({ role: "investigator" });
    const { requests } = (await call({ url: "/api/access-requests" })).json;
    expect(requests).toHaveLength(1);
    expect(requests[0].role).toBe("investigator");
  });

  it("records a decision with who made it, and drops the request from the pending list", async () => {
    const { submit, call } = setup();
    const { json: request } = await submit({ role: "auditor" });

    const resolved = await call({ method: "POST", url: `/api/access-requests/${request.id}/resolve`, body: { status: "rejected" }, as: CHIEF });
    expect(resolved.status).toBe(200);
    expect(resolved.json).toMatchObject({ status: "rejected", resolvedBy: CHIEF });
    expect((await call({ url: "/api/access-requests" })).json.requests).toHaveLength(0);
    expect((await call({ url: "/api/access-requests/mine" })).json.request.status).toBe("rejected");
  });

  it("validates decisions and ids", async () => {
    const { submit, call } = setup();
    const { json: request } = await submit({ role: "auditor" });
    expect((await call({ method: "POST", url: `/api/access-requests/${request.id}/resolve`, body: { status: "maybe" } })).status).toBe(400);
    expect((await call({ method: "POST", url: "/api/access-requests/not-an-id/resolve", body: { status: "approved" } })).status).toBe(400);
    expect((await call({ method: "POST", url: `/api/access-requests/${"0".repeat(36)}/resolve`, body: { status: "approved" } })).status).toBe(404);
    expect((await call({ method: "DELETE", url: "/api/access-requests" })).status).toBe(405);
  });
});

describe("createAccessRequestStore with on-chain roles", () => {
  const ADMIN = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
  const INVESTIGATOR = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
  const roles = { [CHIEF]: { isChief: true }, [ADMIN]: { isAdmin: true }, [INVESTIGATOR]: { isInvestigator: true } };

  it("lets a wallet with no role submit and read its own request, but not list everyone's", async () => {
    const { submit, call } = setup({ roles });
    expect((await submit({ role: "auditor" })).status).toBe(201);
    expect((await call({ url: "/api/access-requests/mine" })).json.request.role).toBe("auditor");
    expect((await call({ url: "/api/access-requests" })).status).toBe(403);
    expect((await call({ url: "/api/access-requests", as: INVESTIGATOR })).status).toBe(403);
    expect((await call({ url: "/api/access-requests", as: ADMIN })).json.requests).toHaveLength(1);
  });

  it("lets only the Chief or an Admin resolve, and only the Chief resolve an Admin request", async () => {
    const { submit, call } = setup({ roles });
    const { json: auditorRequest } = await submit({ role: "auditor" });
    const resolve = (id, as) => call({ method: "POST", url: `/api/access-requests/${id}/resolve`, body: { status: "approved" }, as });

    expect((await resolve(auditorRequest.id, INVESTIGATOR)).status).toBe(403);
    expect((await resolve(auditorRequest.id, ADMIN)).status).toBe(200);

    const { json: adminRequest } = await submit({ role: "admin" });
    expect((await resolve(adminRequest.id, ADMIN)).status).toBe(403);
    expect((await call({ url: "/api/access-requests/mine" })).json.request.status).toBe("pending");
    expect((await resolve(adminRequest.id, CHIEF)).status).toBe(200);
  });
});
