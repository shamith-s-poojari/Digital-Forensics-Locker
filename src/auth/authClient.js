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

  /** @returns {Promise<Session>} */
  async verify(message, signature) {
    const { status, body } = await call("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    if (status !== 200 || typeof body?.address !== "string") throw new Error(body?.error || `Sign-in failed (HTTP ${status}).`);
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
