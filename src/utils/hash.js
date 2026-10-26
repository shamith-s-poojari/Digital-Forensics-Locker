/** Largest file the in-memory hashing accepts (the whole file is read into memory). */
export const MAX_HASH_BYTES = 10 * 1024 * 1024;

/**
 * Computes the SHA-256 digest of a File/Blob using the native Web Crypto API.
 * The whole file is read into memory with `file.arrayBuffer()`, so this is
 * intended for modestly sized files (the upload wizard caps size separately).
 *
 * @param {Blob | File} file - The File (or Blob) to hash.
 * @returns {Promise<string>} Lowercase 64-character hexadecimal SHA-256 digest.
 * @throws {Error} If Web Crypto is unavailable (it requires a secure context:
 *   HTTPS or localhost) or the file cannot be read.
 */
export async function computeSHA256(file) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "SHA-256 hashing is unavailable: the Web Crypto API requires a secure context (HTTPS or localhost)."
    );
  }

  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (readError) {
    throw new Error(`Could not read file: ${readError?.message ?? "unknown read error"}`, {
      cause: readError,
    });
  }

  const digest = await subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const SIZE_UNITS = ["B", "KB", "MB", "GB"];

/**
 * Formats a byte count as a human-readable size.
 * Values below 1024 are shown as whole bytes ("N B"); larger values are shown
 * with two decimals in KB, MB or GB (base 1024). Invalid input (negative,
 * NaN, non-numeric) is treated as 0.
 *
 * @param {number} bytes - Size in bytes.
 * @returns {string} For example "0 B", "512 B", "1.50 KB", "3.47 MB".
 */
export function formatFileSize(bytes) {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (size < 1024) {
    return `${Math.floor(size)} B`;
  }

  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  // Avoid output such as "1024.00 KB" when rounding crosses the next unit.
  let rounded = Number(value.toFixed(2));
  if (rounded >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    rounded = Number((rounded / 1024).toFixed(2));
    unitIndex += 1;
  }

  return `${rounded.toFixed(2)} ${SIZE_UNITS[unitIndex]}`;
}
