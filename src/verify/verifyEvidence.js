// The verification engine for one evidence item: get the bytes, open them if encrypted, hash the ORIGINAL bytes
// locally, and compare that hash with the one registered on chain.

import { decryptEvidence, HEADER_BYTES, readEnvelopeHeader, sha256Hex } from "../crypto/evidenceCrypto.js";
import { MAX_HASH_BYTES } from "../utils/hash";
import { fetchFromIpfs } from "./ipfsFetch.js";

/** An encrypted copy is its plaintext plus the envelope header and the 16-byte GCM tag. */
export const MAX_VERIFY_BYTES = MAX_HASH_BYTES + HEADER_BYTES + 16;

/**
 * Hashes evidence bytes, decrypting them first if they are an encrypted copy. The hash is always of the original
 * evidence, so it can be compared with the ledger whichever form the bytes came in.
 *
 * @param {Uint8Array} bytes
 * @param {object} deps
 * @param {() => Promise<{ ok: boolean, error?: string }>} deps.ensureSession  Needed only for an encrypted copy.
 * @param {{ fetchKey: (keyId: string) => Promise<{ key: string }> }} deps.keyClient
 * @param {(stage: string) => void} [deps.onStage]
 * @returns {Promise<{ encrypted: boolean, sha256: string, plaintext: Uint8Array | null, keyId: string | null }>}
 */
export async function openAndHash(bytes, { ensureSession, keyClient, onStage }) {
  const header = readEnvelopeHeader(bytes);
  if (!header) {
    if (bytes.length > MAX_HASH_BYTES) throw new Error("This file is larger than the 10 MB limit for in-browser hashing.");
    onStage?.("Hashing…");
    return { encrypted: false, sha256: await sha256Hex(bytes), plaintext: null, keyId: null };
  }

  onStage?.("Encrypted copy detected. Checking your sign-in…");
  const auth = await ensureSession();
  if (!auth.ok) throw new Error(auth.error);
  onStage?.("Fetching the decryption key…");
  const { key } = await keyClient.fetchKey(header.keyId);
  onStage?.("Decrypting and hashing in your browser…");
  const { plaintext, sha256, matchesHeader } = await decryptEvidence(bytes, key);
  // GCM already authenticated the header, so this can only fail for an envelope built with a wrong hash claim.
  if (!matchesHeader) throw new Error("The decrypted file does not match the hash its own header claims.");
  return { encrypted: true, sha256, plaintext, keyId: header.keyId };
}

/**
 * Fetches the stored copy of `record` from IPFS, hashes the original bytes locally and asks the ledger whether that
 * hash is the one registered for the record.
 *
 * @param {object} options
 * @param {{ id: number, cid: string }} options.record
 * @param {{ verifyHash: (id: number, sha256: string) => Promise<boolean> }} options.ledger
 * @param {string[]} options.gateways
 * @param {() => Promise<{ ok: boolean, error?: string }>} options.ensureSession
 * @param {{ fetchKey: (keyId: string) => Promise<{ key: string }> }} options.keyClient
 * @param {(stage: string) => void} [options.onStage]
 * @param {AbortSignal} [options.signal]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ gateway: string, encrypted: boolean, sha256: string, matches: boolean, plaintext: Uint8Array | null }>}
 */
export async function verifyStoredCopy({ record, ledger, gateways, ensureSession, keyClient, onStage, signal, fetchImpl }) {
  const { bytes, gateway } = await fetchFromIpfs(record.cid, {
    gateways,
    maxBytes: MAX_VERIFY_BYTES,
    signal,
    fetchImpl,
    onGateway: (g) => onStage?.(`Fetching the stored copy from ${new URL(g).host}…`),
  });
  const opened = await openAndHash(bytes, { ensureSession, keyClient, onStage });
  onStage?.("Comparing with the hash on the ledger…");
  const matches = await ledger.verifyHash(record.id, opened.sha256);
  return { gateway, encrypted: opened.encrypted, sha256: opened.sha256, matches, plaintext: opened.plaintext };
}
