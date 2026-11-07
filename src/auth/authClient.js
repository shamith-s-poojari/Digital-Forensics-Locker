// Browser client for the sign-in endpoints in server/siweAuth.js. The session itself is an httpOnly cookie, so
// this code never sees or stores a token; it only learns which address the server considers signed in.

const HEADERS = { "X-Requested-With": "forensics-locker" };

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers: { ...HEADERS, ...init.headers } });
  } catch (err) {
    throw new Error("Could not reach the sign-in server. Is the dev server running?", { cause: err });
  }
  if (res.status === 204) return { status: 204, body: null };
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/**
 * @typedef {{ address: string, chainId: number, expiresAt: number }} Session
 */
export const authClient = {
  /** @returns {Promise<string>} A fresh single-use nonce. */
  async getNonce() {
    const { status, body } = await call("/api/auth/nonce");
    if (status !== 200 || typeof body?.nonce !== "string") throw new Error(body?.error || `Could not start sign-in (HTTP ${status}).`);
    return body.nonce;
  },

  /**
   * @param {string} [pin]  The account's PIN, when it has one (see getPinStatus).
   * @returns {Promise<Session>} Throws an Error with `code: "BAD_PIN"` when the PIN was missing or wrong.
   */
  async verify(message, signature, pin) {
    const { status, body } = await call("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pin === undefined ? { message, signature } : { message, signature, pin }),
    });
    if (status !== 200 || typeof body?.address !== "string") {
      throw Object.assign(new Error(body?.error || `Sign-in failed (HTTP ${status}).`), { code: body?.code });
    }
    return body;
  },

  /** @returns {Promise<boolean>} Whether the account has a sign-in PIN (and so must enter it to sign in). */
  async getPinStatus(address) {
    const { status, body } = await call(`/api/auth/pin-status?address=${encodeURIComponent(address)}`);
    if (status !== 200 || typeof body?.hasPin !== "boolean") throw new Error(body?.error || `Could not check the account's PIN (HTTP ${status}).`);
    return body.hasPin;
  },

  /**
   * Sets the signed-in account's PIN. Changing an existing one needs `currentPin`.
   * @returns {Promise<Session>}
   */
  async setPin(pin, currentPin) {
    const { status, body } = await call("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPin === undefined ? { pin } : { pin, currentPin }),
    });
    if (status !== 200 || typeof body?.address !== "string") {
      throw Object.assign(new Error(body?.error || `Could not save the PIN (HTTP ${status}).`), { code: body?.code });
    }
    return body;
  },

  /** @returns {Promise<Session | null>} The server's current session for this browser, or null. */
  async getSession() {
    const { status, body } = await call("/api/auth/session");
    return status === 200 && typeof body?.address === "string" ? body : null;
  },

  /** @param {{ keepalive?: boolean }} [options] `keepalive` lets the request finish after the page has gone. */
  async logout({ keepalive = false } = {}) {
    await call("/api/auth/logout", { method: "POST", keepalive });
  },
};
