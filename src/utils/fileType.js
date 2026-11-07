// Works out a decrypted file's type from its first bytes ("magic numbers"), so a saved copy gets an extension the
// operating system can open. The original file name never leaves the uploader's browser (see README, "Encryption
// before pinning"), so the contents are the only clue. Nothing here is trusted for verification: the ledger hash is.

const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
const startsWith = (bytes, signature, offset = 0) => signature.every((b, i) => bytes[offset + i] === b);

// Office Open XML files are ZIP archives; the folder names near the start tell Word, Excel and PowerPoint apart.
function zipKind(bytes) {
  const head = ascii(bytes, 0, Math.min(bytes.length, 4096));
  if (head.includes("word/")) return { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (head.includes("xl/")) return { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  if (head.includes("ppt/")) return { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  return { ext: "zip", mime: "application/zip" };
}

// ISO base media files (MP4, MOV, HEIC…) carry a brand right after "ftyp" at offset 4.
function ftypKind(bytes) {
  const brand = ascii(bytes, 8, 4);
  if (brand === "qt  ") return { ext: "mov", mime: "video/quicktime" };
  if (["heic", "heix", "mif1", "msf1"].includes(brand)) return { ext: "heic", mime: "image/heic" };
  if (brand === "M4A ") return { ext: "m4a", mime: "audio/mp4" };
  return { ext: "mp4", mime: "video/mp4" };
}

// A file with no NUL bytes that decodes as UTF-8 is treated as text.
function looksLikeText(bytes) {
  const sample = bytes.subarray(0, 4096);
  if (sample.length === 0 || sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

const SIGNATURES = [
  { sig: [0xff, 0xd8, 0xff], ext: "jpg", mime: "image/jpeg" },
  { sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ext: "png", mime: "image/png" },
  { sig: [0x47, 0x49, 0x46, 0x38], ext: "gif", mime: "image/gif" },
  { sig: [0x42, 0x4d], ext: "bmp", mime: "image/bmp" },
  { sig: [0x49, 0x49, 0x2a, 0x00], ext: "tif", mime: "image/tiff" },
  { sig: [0x4d, 0x4d, 0x00, 0x2a], ext: "tif", mime: "image/tiff" },
  { sig: [0x25, 0x50, 0x44, 0x46, 0x2d], ext: "pdf", mime: "application/pdf" },
  { sig: [0x50, 0x4b, 0x03, 0x04], kind: zipKind },
  { sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], ext: "7z", mime: "application/x-7z-compressed" },
  { sig: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], ext: "rar", mime: "application/vnd.rar" },
  { sig: [0x1f, 0x8b], ext: "gz", mime: "application/gzip" },
  { sig: [0x49, 0x44, 0x33], ext: "mp3", mime: "audio/mpeg" },
  { sig: [0x66, 0x4c, 0x61, 0x43], ext: "flac", mime: "audio/flac" },
  { sig: [0x4f, 0x67, 0x67, 0x53], ext: "ogg", mime: "audio/ogg" },
  { sig: [0x1a, 0x45, 0xdf, 0xa3], ext: "mkv", mime: "video/x-matroska" },
  { sig: [0x66, 0x74, 0x79, 0x70], offset: 4, kind: ftypKind },
  { sig: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66], ext: "sqlite", mime: "application/vnd.sqlite3" },
  { sig: [0x45, 0x56, 0x46, 0x09, 0x0d, 0x0a, 0xff, 0x00], ext: "E01", mime: "application/octet-stream" },
  { sig: [0xd4, 0xc3, 0xb2, 0xa1], ext: "pcap", mime: "application/vnd.tcpdump.pcap" },
  { sig: [0x0a, 0x0d, 0x0d, 0x0a], ext: "pcapng", mime: "application/vnd.tcpdump.pcap" },
  { sig: [0x7f, 0x45, 0x4c, 0x46], ext: "elf", mime: "application/octet-stream" },
  { sig: [0x4d, 0x5a], ext: "exe", mime: "application/octet-stream" },
];

/**
 * Guesses the type of `bytes` from its contents.
 * @param {Uint8Array} bytes
 * @returns {{ ext: string, mime: string }} `ext` is "bin" when the type is not recognised.
 */
export function detectFileType(bytes) {
  // RIFF containers: the format name sits at offset 8.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46])) {
    const form = ascii(bytes, 8, 4);
    if (form === "WEBP") return { ext: "webp", mime: "image/webp" };
    if (form === "WAVE") return { ext: "wav", mime: "audio/wav" };
    if (form === "AVI ") return { ext: "avi", mime: "video/x-msvideo" };
  }
  for (const { sig, offset = 0, ext, mime, kind } of SIGNATURES) {
    if (startsWith(bytes, sig, offset)) return kind ? kind(bytes) : { ext, mime };
  }
  if (looksLikeText(bytes)) return { ext: "txt", mime: "text/plain" };
  return { ext: "bin", mime: "application/octet-stream" };
}
