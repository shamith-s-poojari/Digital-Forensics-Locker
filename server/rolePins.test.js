import { scrypt } from "node:crypto";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { buildSiweMessage } from "../src/auth/siweMessage.js";
import { createRolePins, LOCKOUT_MS, MAX_ATTEMPTS } from "./rolePins.js";
import { createSiweAuth } from "./siweAuth.js";

const HOST = "localhost:5173";
const ORIGIN = `http://${HOST}`;
// Throwaway test-only key.
const ALICE = new Wallet(`0x${"33".repeat(32)}`);
const T0 = Date.parse("2026-11-07T12:00:00.000Z");

function memoryStorage() {
  const map = new Map();
  return {
    map,
    get: async (address) => (map.has(address) ? structuredClone(map.get(address)) : null),
    put: async (entry) => void map.set(entry.address, structuredClone(entry)),
  };
}

describe("createRolePins", () => {
  it("stores only a salted hash, accepts the right PIN and refuses a wrong one", async () => {
    const storage = memoryStorage();
    const pins = createRolePins({ storage });
    expect(await pins.hasPin(ALICE.address)).toBe(false);
    expect(await pins.check(ALICE.address, undefined)).toEqual({ ok: true }); // no PIN set yet

    await pins.set(ALICE.address.toLowerCase(), "Secr3t!pw");

    const stored = storage.map.get(ALICE.address);
    expect(JSON.stringify(stored)).not.toContain("Secr3t!pw");
    expect(stored.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(await pins.hasPin(ALICE.address)).toBe(true);
    expect(await pins.check(ALICE.address, "Secr3t!pw")).toEqual({ ok: true });
    expect((await pins.check(ALICE.address, "Secr3t!pX")).ok).toBe(false);
    expect((await pins.check(ALICE.address, undefined)).ok).toBe(false);
  });

  it("only sets passwords of 8 to 64 characters with a letter, a number and a symbol", async () => {
    const pins = createRolePins({ storage: memoryStorage() });
    const bad = ["Ab1!", "12345678", "abcdefgh", "abcd1234", "abcd!!!!", "1234!!!!", "Ab1! with space", `Ab1!${"x".repeat(61)}`, "", null];
    for (const pin of bad) {
      await expect(pins.set(ALICE.address, pin)).rejects.toThrow(/letter, one number and one symbol/);
    }
    for (const good of ["Ev1dence!", "pässwörd9#", `Ab1!${"x".repeat(60)}`]) {
      await expect(pins.set(ALICE.address, good)).resolves.toBeUndefined();
      expect(await pins.check(ALICE.address, good)).toEqual({ ok: true });
    }
  });

  it("still accepts a numeric PIN stored before passwords were required", async () => {
    const storage = memoryStorage();
    const salt = "00".repeat(16);
    const hash = (await promisify(scrypt)("1234", Buffer.from(salt, "hex"), 32)).toString("hex");
    await storage.put({ address: ALICE.address, salt, hash });
    const pins = createRolePins({ storage });
    expect(await pins.check(ALICE.address, "1234")).toEqual({ ok: true });
    expect((await pins.check(ALICE.address, "4321")).error).toMatch(/wrong password/);
  });

  it(`locks the account for a while after ${MAX_ATTEMPTS} wrong PINs, even against the right one`, async () => {
    const clock = { now: T0 };
    const pins = createRolePins({ storage: memoryStorage(), now: () => clock.now });
    await pins.set(ALICE.address, "Lock3d!pw");

    for (let i = 1; i < MAX_ATTEMPTS; i++) expect((await pins.check(ALICE.address, "Wr0ng!pw")).error).toMatch(/attempts? left/);
    expect((await pins.check(ALICE.address, "Wr0ng!pw")).error).toMatch(/locked/);
    expect((await pins.check(ALICE.address, "Lock3d!pw")).error).toMatch(/too many wrong passwords/);

    clock.now += LOCKOUT_MS + 1;
    expect(await pins.check(ALICE.address, "Lock3d!pw")).toEqual({ ok: true });
  });
});

describe("sign-in with role PINs", () => {
  function setup() {
    const pins = createRolePins({ storage: memoryStorage(), now: () => T0 });
    const auth = createSiweAuth({ now: () => T0, pins });
    let cookie = null;
    async function call({ method = "GET", url, body }) {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
      Object.assign(req, { method, url, headers: { host: HOST, origin: ORIGIN, "x-requested-with": "forensics-locker", ...(cookie ? { cookie } : {}) } });
      const res = {
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
      await auth.handle(req, res);
      if (res.headers["set-cookie"]) cookie = res.headers["set-cookie"].split(";")[0];
      return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, req };
    }
    async function signIn(pin) {
      const { json } = await call({ url: "/api/auth/nonce" });
      const message = buildSiweMessage({
        domain: HOST,
        address: ALICE.address,
        uri: ORIGIN,
        chainId: 11155111,
        nonce: json.nonce,
        issuedAt: new Date(T0).toISOString(),
        expirationTime: new Date(T0 + 5 * 60_000).toISOString(),
      });
      return call({ method: "POST", url: "/api/auth/verify", body: { message, signature: await ALICE.signMessage(message), pin } });
    }
    const sessionFor = () => auth.getSession({ headers: { cookie } });
    return { call, signIn, sessionFor };
  }

  it("lets an account with no PIN in, but treats it as signed out until it sets one", async () => {
    const { call, signIn, sessionFor } = setup();
    expect((await call({ url: `/api/auth/pin-status?address=${ALICE.address}` })).json).toEqual({ hasPin: false });

    const first = await signIn();
    expect(first.status).toBe(200);
    expect(first.json.needsPin).toBe(true);
    expect(sessionFor()).toBeNull(); // other endpoints refuse it

    expect((await call({ method: "POST", url: "/api/auth/pin", body: { pin: "12" } })).status).toBe(400);
    const set = await call({ method: "POST", url: "/api/auth/pin", body: { pin: "Ev1dence!" } });
    expect(set.status).toBe(200);
    expect(set.json.needsPin).toBe(false);
    expect(sessionFor()?.address).toBe(ALICE.address);
    expect((await call({ url: `/api/auth/pin-status?address=${ALICE.address}` })).json).toEqual({ hasPin: true });
  });

  it("refuses a sign-in without the right PIN once one is set", async () => {
    const { call, signIn, sessionFor } = setup();
    await signIn();
    await call({ method: "POST", url: "/api/auth/pin", body: { pin: "Ev1dence!" } });
    await call({ method: "POST", url: "/api/auth/logout" });

    const missing = await signIn();
    expect(missing.status).toBe(401);
    expect(missing.json.code).toBe("BAD_PIN");
    const wrong = await signIn("1357");
    expect(wrong.status).toBe(401);
    expect(wrong.json.error).toMatch(/wrong password/);
    expect(sessionFor()).toBeNull();

    const right = await signIn("Ev1dence!");
    expect(right.status).toBe(200);
    expect(right.json.needsPin).toBe(false);
    expect(sessionFor()?.address).toBe(ALICE.address);
  });

  it("needs the current PIN to change it", async () => {
    const { call, signIn } = setup();
    await signIn();
    await call({ method: "POST", url: "/api/auth/pin", body: { pin: "Ev1dence!" } });

    expect((await call({ method: "POST", url: "/api/auth/pin", body: { pin: "N3w-pass#" } })).status).toBe(401);
    expect((await call({ method: "POST", url: "/api/auth/pin", body: { pin: "N3w-pass#", currentPin: "Ev1dence!" } })).status).toBe(200);
  });
});
