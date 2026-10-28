import { id as keccakId } from "ethers";

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/** "ab12...ef" (64 hex chars) -> "0xab12...ef" for a bytes32 argument. Throws on anything else. */
export function hexToBytes32(hex) {
  const clean = String(hex).replace(/^0x/i, "");
  if (!HEX_64.test(clean)) throw new TypeError("Expected a 64-character hexadecimal hash");
  return `0x${clean.toLowerCase()}`;
}

/** "0xab12...ef" (bytes32) -> "ab12...ef", the form people compare against other tools. */
export function bytes32ToHex(bytes32) {
  return String(bytes32).replace(/^0x/i, "").toLowerCase();
}

/** Shortens a hash, CID or address for display: head...tail. Short inputs are returned unchanged. */
export function shorten(value, head = 6, tail = 4) {
  const s = String(value ?? "");
  return s.length <= head + tail + 3 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function sameAddress(a, b) {
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}

/**
 * Opaque case reference stored on chain.
 *
 * TEMPORARY, and weaker than it should be: this is an UNSALTED hash, so anyone who can guess a case number
 * (for example CASE-2025-0042) can confirm which on-chain records belong to it. The real design computes an
 * HMAC with a server-side secret (Phase 1 API). Do not rely on the privacy of this value.
 */
export function deriveCaseRef(caseNumber) {
  const normalised = String(caseNumber ?? "").trim().toUpperCase();
  if (!normalised) throw new TypeError("A case number is required");
  return keccakId(`forensics-locker/case/v1:${normalised}`);
}

/** Unix seconds -> "2026-10-26 14:03:09 UTC" (stable, unambiguous, good for evidence records). */
export function formatUtc(seconds) {
  if (!Number.isFinite(seconds)) return "";
  return new Date(seconds * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/** Unix seconds -> "3 minutes ago". */
export function timeAgo(seconds, nowMs = Date.now()) {
  const diff = Math.round((nowMs - seconds * 1000) / 1000);
  if (diff < 45) return "just now";
  const units = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  let value = diff;
  let label = "second";
  for (const [size, name] of units) {
    if (diff >= size) {
      value = Math.floor(diff / size);
      label = name;
    }
  }
  return `${value} ${label}${value === 1 ? "" : "s"} ago`;
}
