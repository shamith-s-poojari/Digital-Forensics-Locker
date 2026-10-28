import { sha256, solidityPacked } from "ethers";
import { bytes32ToHex, hexToBytes32 } from "./format.js";

/**
 * The case chain, exactly as EvidenceLocker computes it (see the contract's notes):
 *
 *   h_0 = SHA256(caseId)                                  caseId as 32 big-endian bytes
 *   h_i = SHA256(h_{i-1} || e_i || CID_i || W_i || T_i)   packed, no padding (abi.encodePacked)
 *
 * e_i is the evidence SHA-256, CID_i the content identifier, W_i the registering officer, T_i the block timestamp.
 * The demo ledger uses this to stay identical to the contract; the verification engine uses it to recompute a
 * case independently of the contract's own `verifyCaseChain`.
 *
 * Hashes are 64 lowercase hex characters without "0x", like every other hash in the app's data shapes.
 */

/** Bounds that keep a contract Record at exactly 256 bytes (the CID fills exactly two storage slots). */
export const MIN_CID_LENGTH = 33;
export const MAX_CID_LENGTH = 64;

/** True when the CID's UTF-8 length fits the contract's bounds. */
export function isValidCid(cid) {
  if (typeof cid !== "string") return false;
  const length = new TextEncoder().encode(cid).length;
  return length >= MIN_CID_LENGTH && length <= MAX_CID_LENGTH;
}

/** @param {string} caseRef 0x-prefixed 32-byte case id. */
export function caseGenesis(caseRef) {
  return bytes32ToHex(sha256(solidityPacked(["uint256"], [hexToBytes32(caseRef)])));
}

/**
 * @param {string} previousLink 64 hex characters (h_{i-1}).
 * @param {{ sha256: string, cid: string, officer: string, timestamp: number | bigint }} record
 * @returns {string} h_i, 64 hex characters.
 */
export function computeLink(previousLink, { sha256: evidenceHash, cid, officer, timestamp }) {
  return bytes32ToHex(
    sha256(solidityPacked(["bytes32", "bytes32", "string", "address", "uint256"], [hexToBytes32(previousLink), hexToBytes32(evidenceHash), cid, officer, BigInt(timestamp)]))
  );
}
