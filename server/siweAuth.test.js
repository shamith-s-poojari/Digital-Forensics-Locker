import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { buildSiweMessage } from "../src/auth/siweMessage.js";
import { createSiweAuth, NONCE_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS } from "./siweAuth.js";

const HOST = "localhost:5173";
const ORIGIN = `http://${HOST}`;
// Throwaway test-only keys.
const ALICE = new Wallet(`0x${"11".repeat(32)}`);
const MALLORY = new Wallet(`0x${"22".repeat(32)}`);
const T0 = Date.parse("2026-10-26T12:00:00.000Z");

function makeReq({ method = "GET", url, headers = {}, body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { host: HOST, origin: ORIGIN, "x-requested-with": "forensics-locker", ...headers };
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

function setup() {
  const clock = { now: T0 };
  const auth = createSiweAuth({ now: () => clock.now });
  async function call(options) {
    const res = makeRes();
    const handled = await auth.handle(makeReq(options), res);
    return { handled, res, status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, cookie: res.headers["set-cookie"] };
  }
  async function nonce() {
    return (await call({ url: "/api/auth/nonce" })).json.nonce;
  }
  function message(fields = {}) {
    return buildSiweMessage({
      domain: HOST,
      address: ALICE.address,
      uri: ORIGIN,
      chainId: 11155111,
      issuedAt: new Date(clock.now).toISOString(),
      expirationTime: new Date(clock.now + 5 * 60_000).toISOString(),
      ...fields,
    });
  }
  async function verify(text, signer = ALICE, extra = {}) {
    return call({ method: "POST", url: "/api/auth/verify", body: { message: text, signature: await signer.signMessage(text) }, ...extra });
  }
  const cookieHeader = (setCookie) => setCookie.split(";")[0];
  return { auth, clock, call, nonce, message, verify, cookieHeader };
}

describe("createSiweAuth", () => {
  it("ignores paths outside /api/auth/", async () => {
    const { call } = setup();
    expect((await call({ url: "/api/pin" })).handled).toBe(false);
  });

  it("issues distinct alphanumeric nonces", async () => {
    const { nonce } = setup();
    const a = await nonce();
    const b = await nonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).not.toBe(a);
  });

  it("refuses cross-site requests (no custom header, or a foreign Origin)", async () => {
    const { call } = setup();
    expect((await call({ url: "/api/auth/nonce", headers: { "x-requested-with": undefined } })).status).toBe(403);
    expect((await call({ url: "/api/auth/nonce", headers: { origin: "https://evil.example" } })).status).toBe(403);
  });

  it("signs in with a valid signature over a fresh nonce and sets an httpOnly, SameSite=Strict cookie", async () => {
    const { auth, nonce, message, verify, call, cookieHeader } = setup();
    const result = await verify(message({ nonce: await nonce() }));

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ address: ALICE.address, chainId: 11155111, expiresAt: T0 + SESSION_TTL_MS });
    expect(result.cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600$`));

    const session = await call({ url: "/api/auth/session", headers: { cookie: cookieHeader(result.cookie) } });
    expect(session.status).toBe(200);
    expect(session.json.address).toBe(ALICE.address);
    expect(auth.getSession(makeReq({ headers: { cookie: cookieHeader(result.cookie) } }))?.address).toBe(ALICE.address);
  });

  it("rejects a replayed message: each nonce works once", async () => {
    const { nonce, message, verify } = setup();
    const text = message({ nonce: await nonce() });
    expect((await verify(text)).status).toBe(200);

    const replay = await verify(text);
    expect(replay.status).toBe(401);
    expect(replay.json.error).toMatch(/expired or was already used/);
  });

  it("burns the nonce on a failed attempt too", async () => {
    const { nonce, message, verify } = setup();
    const text = message({ nonce: await nonce() });
    expect((await verify(text, MALLORY)).status).toBe(401);
    expect((await verify(text)).status).toBe(401);
  });

  it("rejects a nonce the server never issued", async () => {
    const { message, verify } = setup();
    expect((await verify(message({ nonce: "deadbeefdeadbeef" }))).status).toBe(401);
  });

  it("rejects a nonce older than its lifetime", async () => {
    const { clock, nonce, message, verify } = setup();
    const n = await nonce();
    clock.now += NONCE_TTL_MS + 1;
    expect((await verify(message({ nonce: n }))).status).toBe(401);
  });

  it("rejects a signature from another key (forged login)", async () => {
    const { nonce, message, verify } = setup();
    const result = await verify(message({ nonce: await nonce() }), MALLORY);
    expect(result.status).toBe(401);
    expect(result.json.error).toMatch(/does not belong to the address/);
  });

  it("rejects a message made for another site", async () => {
    const { nonce, message, verify } = setup();
    expect((await verify(message({ nonce: await nonce(), domain: "evil.example" }))).status).toBe(401);
    expect((await verify(message({ nonce: await nonce(), uri: "https://evil.example" }))).status).toBe(401);
  });

  it("rejects an expired message and one dated in the future", async () => {
    const { clock, nonce, message, verify } = setup();
    expect((await verify(message({ nonce: await nonce(), expirationTime: new Date(clock.now - 1).toISOString() }))).status).toBe(401);
    expect((await verify(message({ nonce: await nonce(), issuedAt: new Date(clock.now + 10 * 60_000).toISOString() }))).status).toBe(401);
  });

  it("rejects a message that is not exactly in the expected format", async () => {
    const { nonce, message, verify } = setup();
    const tampered = `${message({ nonce: await nonce() })}\nResources:\n- https://evil.example`;
    expect((await verify(tampered)).json.error).toMatch(/expected format/);
  });

  it("rejects a malformed body without crashing", async () => {
    const { call } = setup();
    expect((await call({ method: "POST", url: "/api/auth/verify", body: "not json" })).status).toBe(400);
    expect((await call({ method: "POST", url: "/api/auth/verify", body: { message: 1, signature: 2 } })).status).toBe(401);
  });

  it("enforces a chain when configured", async () => {
    const clock = { now: T0 };
    const auth = createSiweAuth({ now: () => clock.now, chainId: 1 });
    const nonceRes = makeRes();
    await auth.handle(makeReq({ url: "/api/auth/nonce" }), nonceRes);
    const text = buildSiweMessage({
      domain: HOST,
      address: ALICE.address,
      uri: ORIGIN,
      chainId: 11155111,
      nonce: JSON.parse(nonceRes.body).nonce,
      issuedAt: new Date(T0).toISOString(),
      expirationTime: new Date(T0 + 60_000).toISOString(),
    });
    const res = makeRes();
    await auth.handle(makeReq({ method: "POST", url: "/api/auth/verify", body: { message: text, signature: await ALICE.signMessage(text) } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("expires sessions", async () => {
    const { clock, nonce, message, verify, call, cookieHeader } = setup();
    const { cookie } = await verify(message({ nonce: await nonce() }));
    clock.now += SESSION_TTL_MS;
    expect((await call({ url: "/api/auth/session", headers: { cookie: cookieHeader(cookie) } })).status).toBe(401);
  });

  it("logs out: the cookie is cleared and the session no longer works", async () => {
    const { nonce, message, verify, call, cookieHeader } = setup();
    const { cookie } = await verify(message({ nonce: await nonce() }));
    const logout = await call({ method: "POST", url: "/api/auth/logout", headers: { cookie: cookieHeader(cookie) } });

    expect(logout.status).toBe(204);
    expect(logout.cookie).toMatch(/Max-Age=0/);
    expect((await call({ url: "/api/auth/session", headers: { cookie: cookieHeader(cookie) } })).status).toBe(401);
  });

  it("replaces the browser's previous session when it signs in again (account switch)", async () => {
    const { nonce, message, verify, call, cookieHeader } = setup();
    const first = await verify(message({ nonce: await nonce() }));
    const second = await verify(message({ nonce: await nonce(), address: MALLORY.address }), MALLORY, { headers: { cookie: cookieHeader(first.cookie) } });

    expect(second.status).toBe(200);
    expect((await call({ url: "/api/auth/session", headers: { cookie: cookieHeader(first.cookie) } })).status).toBe(401);
    expect((await call({ url: "/api/auth/session", headers: { cookie: cookieHeader(second.cookie) } })).json.address).toBe(MALLORY.address);
  });

  it("does not accept an unknown session cookie", async () => {
    const { call } = setup();
    expect((await call({ url: "/api/auth/session", headers: { cookie: `${SESSION_COOKIE}=made-up` } })).status).toBe(401);
  });
});
