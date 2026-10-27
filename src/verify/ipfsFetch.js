// Fetches a stored copy from public IPFS gateways, for verification.
//
// A gateway is NOT trusted: whatever it returns is decrypted (which authenticates every byte of an encrypted copy)
// and hashed, and only that hash is compared with the ledger. A dishonest or broken gateway can therefore make a
// check fail, never pass. Privacy: the gateway learns that someone fetched this CID, and from which address.

const CID = /^[A-Za-z0-9]{8,128}$/;

/**
 * @param {string} cid
 * @param {object} options
 * @param {string[]} options.gateways   Base URLs ending in "/" (see config.js `ipfsGateways`), tried in order.
 * @param {number} options.maxBytes     Refuse anything larger (read incrementally, so a huge reply is cut off early).
 * @param {number} [options.timeoutMs]  Per gateway.
 * @param {AbortSignal} [options.signal]
 * @param {(gateway: string) => void} [options.onGateway] Called before each attempt.
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ bytes: Uint8Array, gateway: string }>}
 */
export async function fetchFromIpfs(cid, { gateways, maxBytes, timeoutMs = 30_000, signal, onGateway, fetchImpl = fetch }) {
  // The CID becomes part of a URL: allow only its alphabet, so it can never add a path, query or host.
  if (!CID.test(String(cid))) throw new Error("This record's CID is not a valid content identifier.");

  const failures = [];
  for (const gateway of gateways) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Cancelled", "AbortError");
    onGateway?.(gateway);
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const res = await fetchImpl(`${gateway}${cid}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) throw new Error("the file is larger than the verification limit");
      return { bytes: await readCapped(res, maxBytes), gateway };
    } catch (err) {
      if (signal?.aborted) throw err;
      const reason = err?.name === "TimeoutError" ? "timed out" : err?.message || "network error";
      failures.push(`${new URL(gateway).host}: ${reason}`);
    }
  }
  throw new Error(`Could not fetch the stored copy from IPFS (${failures.join("; ")}).`);
}

async function readCapped(res, maxBytes) {
  if (!res.body?.getReader) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error("the file is larger than the verification limit");
    return bytes;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("the file is larger than the verification limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
