// Role PINs: a second secret, besides the wallet's key, that each account must enter when signing in. MetaMask cannot
// be locked by a website, so the app locks itself: every sign-in (and so every role switch) asks for the PIN of the
// account being signed in as, and the server refuses the sign-in without it (server/siweAuth.js).
//
// Only a salted scrypt hash is stored. Wrong PINs are counted per address; after MAX_ATTEMPTS the address is locked for
// LOCKOUT_MS. The counters live in memory, so a server restart clears them.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getAddress, isAddress } from "ethers";

const scrypt = promisify(scryptCallback);

export const PIN_PATTERN = /^\d{4,8}$/;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60_000;
const KEY_LENGTH = 32;

export const isValidPin = (pin) => typeof pin === "string" && PIN_PATTERN.test(pin);

async function hashPin(pin, saltHex) {
  return (await scrypt(pin, Buffer.from(saltHex, "hex"), KEY_LENGTH)).toString("hex");
}

/**
 * @param {object} options
 * @param {{ get(address: string): Promise<object | null>, put(entry: object): Promise<void> }} options.storage
 * @param {() => number} [options.now]
 */
export function createRolePins({ storage, now = Date.now }) {
  /** address -> { failures, lockedUntil } */
  const attempts = new Map();
  const key = (address) => getAddress(address);

  async function hasPin(address) {
    if (!isAddress(address)) return false;
    return (await storage.get(key(address))) !== null;
  }

  /**
   * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
   */
  async function check(address, pin) {
    const id = key(address);
    const state = attempts.get(id);
    const time = now();
    if (state?.lockedUntil > time) {
      const minutes = Math.ceil((state.lockedUntil - time) / 60_000);
      return { ok: false, error: `too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
    }
    const entry = await storage.get(id);
    if (!entry) return { ok: true };
    if (!isValidPin(pin)) return { ok: false, error: "enter the 4 to 8 digit PIN for this account." };

    const expected = Buffer.from(entry.hash, "hex");
    const actual = Buffer.from(await hashPin(pin, entry.salt), "hex");
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      attempts.delete(id);
      return { ok: true };
    }
    const failures = (state?.lockedUntil && state.lockedUntil <= time ? 0 : (state?.failures ?? 0)) + 1;
    if (failures >= MAX_ATTEMPTS) {
      attempts.set(id, { failures: 0, lockedUntil: time + LOCKOUT_MS });
      return { ok: false, error: `wrong PIN. Too many attempts: this account is locked for ${LOCKOUT_MS / 60_000} minutes.` };
    }
    attempts.set(id, { failures, lockedUntil: 0 });
    const left = MAX_ATTEMPTS - failures;
    return { ok: false, error: `wrong PIN. ${left} attempt${left === 1 ? "" : "s"} left.` };
  }

  /** Stores a new PIN for the address (replacing any previous one). The caller checks who may do this. */
  async function set(address, pin) {
    if (!isValidPin(pin)) throw Object.assign(new Error("A PIN is 4 to 8 digits."), { code: "INVALID_PIN" });
    const salt = randomBytes(16).toString("hex");
    const existing = await storage.get(key(address));
    const time = new Date(now()).toISOString();
    await storage.put({ address: key(address), salt, hash: await hashPin(pin, salt), createdAt: existing?.createdAt ?? time, updatedAt: time });
    attempts.delete(key(address));
  }

  return { hasPin, check, set };
}
