// The hash of a custody note, recorded on chain as the noteHash of a custody entry. The text itself stays off chain.
//
//   noteHash = SHA256( UTF-8( JSON.stringify(["dfl-custody-note/v1", evidenceId, author, note, salt]) ) )
//
// `salt` is 32 random bytes (hex) kept off chain: without it, anyone could confirm a guessed note against the public
// chain. The evidence id and author are covered, so a stored note cannot be moved to another item or another person.
//
// Shared by the browser and the server (server/custodyNotes.js), so both compute it identically.

import { sha256, toUtf8Bytes } from "ethers";
import { sameAddress } from "../web3/format.js";
import { normaliseText } from "../cases/caseDigest.js";

export const CUSTODY_NOTE_DOMAIN = "dfl-custody-note/v1";
export const MAX_NOTE_LENGTH = 2000;
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * @param {{ evidenceId: number, author: string, note: string, salt: string }} fields
 * @returns {string} 64 lowercase hex characters (no "0x").
 */
export function computeNoteHash({ evidenceId, author, note, salt }) {
  if (!HEX_64.test(String(salt))) throw new TypeError("Expected a 32-byte hex salt");
  const encoded = JSON.stringify([CUSTODY_NOTE_DOMAIN, Number(evidenceId), String(author).toLowerCase(), normaliseText(note), salt]);
  return sha256(toUtf8Bytes(encoded)).slice(2);
}

/**
 * Compares a custody entry's on-chain noteHash with the stored notes. The stored hash is a convenience, not trusted:
 * the note counts only if its own fields reproduce the hash on chain and its author is who made the entry.
 *
 * @param {{ noteHash: string | null, actor: string }} entry
 * @param {number} evidenceId
 * @param {object[] | null | undefined} notes  The evidence item's stored notes; null or undefined when not readable.
 * @returns {{ status: "none" | "unavailable" | "verified" | "altered", note?: object }}
 */
export function matchNote(entry, evidenceId, notes) {
  if (!entry.noteHash) return { status: "none" };
  const note = notes?.find((n) => n.noteHash === entry.noteHash);
  if (!note) return { status: "unavailable" };
  try {
    const intact = computeNoteHash({ evidenceId, author: note.author, note: note.note, salt: note.salt }) === entry.noteHash;
    return { status: intact && sameAddress(note.author, entry.actor) ? "verified" : "altered", note };
  } catch {
    return { status: "altered", note };
  }
}
