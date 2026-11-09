// The acquisition record: what happened to a piece of evidence BEFORE it was registered on the ledger.
//
// A block timestamp proves when the hash reached the ledger, not when the evidence was seized. Standard forensic
// practice closes that gap with the acquisition report: the imaging tool hashes the source at seizure time. If that
// hash equals the registered hash, the file is unchanged since seizure. The record (time, place, officer, that hash)
// is anchored as a custody note, so it cannot be edited after registration without the timeline flagging it.

const SHA256 = /^[0-9a-f]{64}$/;
const clean = (h) => String(h ?? "").trim().toLowerCase().replace(/^0x/, "");

/**
 * Validates the acquisition fields against the file being registered.
 * @returns {{ error: string } | { error: null, record: { seizedAtMs: number, seizedWhere: string, acquisitionHash: string | null, fileHash: string } }}
 */
export function checkAcquisition({ seizedAt, seizedWhere, acquisitionHash, fileHash, now = Date.now() }) {
  const seizedAtMs = Date.parse(seizedAt ?? "");
  if (!seizedAt || Number.isNaN(seizedAtMs)) return { error: "Enter when the evidence was seized or acquired." };
  if (seizedAtMs > now + 60_000) return { error: "The seizure time is in the future." };
  const where = String(seizedWhere ?? "").trim();
  if (!where) return { error: "Say where the evidence was seized, by whom, and from what device." };
  const acq = clean(acquisitionHash);
  if (acq && !SHA256.test(acq)) return { error: "The acquisition hash must be a SHA-256: 64 hexadecimal characters." };
  const file = clean(fileHash);
  if (acq && acq !== file) {
    return { error: `This file's SHA-256 (${file.slice(0, 12)}…) differs from the hash recorded at acquisition (${acq.slice(0, 12)}…). The file has changed since seizure, or it is the wrong file.` };
  }
  return { error: null, record: { seizedAtMs, seizedWhere: where, acquisitionHash: acq || null, fileHash: file } };
}

function duration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} days ${hours % 24} h`;
}

/** The note text anchored on the ledger. Its first line marks it as the acquisition record. */
export function acquisitionNote({ seizedAtMs, seizedWhere, acquisitionHash, fileHash, registeredAt = Date.now() }) {
  return [
    "ACQUISITION RECORD",
    `Seized/acquired at: ${new Date(seizedAtMs).toISOString().replace("T", " ").slice(0, 16)} UTC`,
    `Where / by whom / device: ${seizedWhere}`,
    acquisitionHash
      ? `SHA-256 at acquisition: ${acquisitionHash} (equals the registered hash: unchanged since seizure)`
      : "SHA-256 at acquisition: not supplied (integrity proven from registration only)",
    `Registered ${duration(registeredAt - seizedAtMs)} after seizure.`,
    `Registered SHA-256: ${fileHash}`,
  ].join("\n");
}
