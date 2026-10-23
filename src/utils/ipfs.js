/**
 * Uploads a file to IPFS through the server-side proxy (POST /api/pin). The Pinata credential stays on the
 * server; the browser never sees it.
 *
 * @param {File} file
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
 * @returns {Promise<string>} The CID of the pinned file.
 */
export async function uploadToIPFS(file, { signal, timeoutMs = 30_000 } = {}) {
  const body = new FormData();
  body.append("file", file);

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res;
  try {
    res = await fetch("/api/pin", {
      method: "POST",
      // Custom header: the proxy requires it, which blocks cross-site form posts (CSRF).
      headers: { "X-Requested-With": "forensics-locker" },
      body, // do NOT set Content-Type: the browser adds it together with the multipart boundary
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // cancelled by the caller
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error("Upload timed out. Check your connection or try a smaller file.", { cause: err });
    }
    throw new Error("Could not reach the upload server. Is the dev server running?", { cause: err });
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Upload failed (HTTP ${res.status}).`);
  }
  if (!payload?.cid) throw new Error("The upload server returned no CID.");
  return payload.cid;
}
