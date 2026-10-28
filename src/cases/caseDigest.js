// The digest of a case's descriptive fields, anchored on chain with every evidence record of the case.
//
//   caseDigest = SHA256( UTF-8( JSON.stringify(["dfl-case-details/v1", caseRef, caseNumber, title, description, salt]) ) )
//
// - A JSON array (not an object) fixes the field order, so the encoding is unambiguous.
// - Strings are trimmed and Unicode-normalised (NFC), so the same text always gives the same digest.
// - `salt` is 32 random bytes (hex) chosen for each version and kept off chain. Without it, anyone could guess a
//   likely title ("Ransomware Attack - City Hospital") and confirm the guess against the public chain.
//
// Shared by the browser and the server (server/caseStore.js), so both compute it identically.

import { sha256, toUtf8Bytes } from "ethers";

export const CASE_DIGEST_DOMAIN = "dfl-case-details/v1";
const HEX_64 = /^[0-9a-f]{64}$/;

export const normaliseText = (value) => String(value ?? "").normalize("NFC").trim();

/**
 * @param {{ caseRef: string, caseNumber: string, title: string, description?: string, salt: string }} fields
 * @returns {string} 64 lowercase hex characters (no "0x").
 */
export function computeCaseDigest({ caseRef, caseNumber, title, description = "", salt }) {
  if (!HEX_64.test(String(salt))) throw new TypeError("Expected a 32-byte hex salt");
  const encoded = JSON.stringify([CASE_DIGEST_DOMAIN, String(caseRef).toLowerCase(), normaliseText(caseNumber).toUpperCase(), normaliseText(title), normaliseText(description), salt]);
  return sha256(toUtf8Bytes(encoded)).slice(2);
}

/** 32 random bytes as hex, for a new version's salt. */
export function newSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}
