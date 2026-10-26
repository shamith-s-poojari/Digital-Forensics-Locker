// Browser client for the evidence key store (server/keyStore.js). Both calls need a wallet sign-in session (the
// httpOnly cookie is sent automatically); callers run `ensureSession()` first.

const HEADERS = { "X-Requested-With": "forensics-locker" };

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers: { ...HEADERS, ...init.headers } });
  } catch (err) {
    throw new Error("Could not reach the key server. Is the dev server running?", { cause: err });
  }
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export const keyClient = {
  /** Escrows a file's key. Resolves once the server has written it; throws otherwise. */
  async storeKey({ keyId, sha256, key }) {
    const { status, body } = await call("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId, sha256, key }),
    });
    if (status !== 201) throw new Error(body?.error || `Could not store the decryption key (HTTP ${status}).`);
  },

  /** @returns {Promise<{ keyId: string, sha256: string, key: string, createdBy: string, createdAt: string }>} */
  async fetchKey(keyId) {
    const { status, body } = await call(`/api/keys/${encodeURIComponent(keyId)}`);
    if (status !== 200 || typeof body?.key !== "string") throw new Error(body?.error || `Could not get the decryption key (HTTP ${status}).`);
    return body;
  },
};
