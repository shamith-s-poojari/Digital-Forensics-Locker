// Server-side proxy for Pinata pinning (Node http request/response handler).
//
// The Pinata JWT lives ONLY here, on the server. The browser sends the file to /api/pin and never
// sees the credential. Framework-agnostic: it takes a Node (req, res) pair, so it can be mounted in the
// Vite dev/preview servers (see vite.config.js) or any Node host.
//
// Guards, because this endpoint spends the account owner's Pinata quota:
//  - POST only, multipart/form-data only, body capped at MAX_UPLOAD_BYTES (+ multipart overhead).
//  - Requires the custom header "X-Requested-With: forensics-locker". Browsers will not send a custom
//    header cross-site without a CORS preflight, which this server never approves, so a random web page
//    cannot make a visitor's browser pin files with your key.
//  - If an Origin header is present it must match the Host header.
//  - When mounted by vite.config.js, the caller must hold a wallet sign-in session (server/siweAuth.js).
//  - The upstream error text is passed on, the token never is.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
export const REQUIRED_HEADER_VALUE = "forensics-locker";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/** Reads the request body, rejecting as soon as it exceeds `limit` bytes. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > limit) {
        reject(Object.assign(new Error("Request body too large"), { code: "TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function originMatchesHost(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ jwt?: string, fetchImpl?: typeof fetch, authorize?: (req: import("node:http").IncomingMessage) => boolean }} options
 *        authorize: when given, requests it returns false for are refused with 401 (vite.config.js passes the
 *        wallet sign-in check from server/siweAuth.js).
 */
export async function handlePinRequest(req, res, { jwt, fetchImpl = fetch, authorize } = {}) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  if (!jwt) {
    return sendJson(res, 503, {
      error: "IPFS upload is not configured on the server. Set PINATA_JWT in .env and restart the dev server.",
    });
  }

  if (req.headers["x-requested-with"] !== REQUIRED_HEADER_VALUE || !originMatchesHost(req)) {
    return sendJson(res, 403, { error: "Request rejected." });
  }

  if (authorize && !authorize(req)) {
    return sendJson(res, 401, { error: "Sign in with your wallet before uploading evidence." });
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return sendJson(res, 400, { error: "Expected multipart/form-data with a single 'file' field." });
  }

  const limit = MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES;
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    return sendJson(res, 413, { error: "File too large. Maximum size is 10 MB." });
  }

  let body;
  try {
    body = await readBody(req, limit);
  } catch (err) {
    if (err.code === "TOO_LARGE") return sendJson(res, 413, { error: "File too large. Maximum size is 10 MB." });
    return sendJson(res, 400, { error: "Could not read the upload." });
  }

  let upstream;
  try {
    upstream = await fetchImpl(PINATA_PIN_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": contentType },
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return sendJson(res, timedOut ? 504 : 502, {
      error: timedOut ? "Pinata did not respond in time." : "Could not reach Pinata.",
    });
  }

  const payload = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    const detail = payload?.error?.details ?? payload?.error?.reason ?? payload?.error;
    // 401/403 from Pinata means OUR credential is bad: that is a server problem, not the user's.
    const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status;
    const message =
      upstream.status === 401 || upstream.status === 403
        ? "Pinata rejected the server's credentials. Check PINATA_JWT."
        : typeof detail === "string" && detail
        ? detail
        : `Pinata returned HTTP ${upstream.status}.`;
    return sendJson(res, status, { error: message });
  }

  if (!payload?.IpfsHash) {
    return sendJson(res, 502, { error: "Pinata returned an unexpected response." });
  }
  return sendJson(res, 200, { cid: payload.IpfsHash, size: payload.PinSize, timestamp: payload.Timestamp });
}

/** Resolves the server-side token. Prefers PINATA_JWT; falls back to the legacy VITE_ name (read in Node only). */
export function resolvePinataJwt(env) {
  if (env.PINATA_JWT) return { jwt: env.PINATA_JWT, legacy: false };
  if (env.VITE_PINATA_JWT) return { jwt: env.VITE_PINATA_JWT, legacy: true };
  return { jwt: undefined, legacy: false };
}
