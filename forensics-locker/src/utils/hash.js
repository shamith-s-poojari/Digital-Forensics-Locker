/**
 * Reads a File as an ArrayBuffer using the FileReader API,
 * then computes its SHA-256 digest via the native Web Crypto API.
 * Returns a lowercase 64-character hex string.
 *
 * @param {File} file - The File object to hash.
 * @returns {Promise<string>} A promise that resolves with the SHA-256 hex digest.
 */
export function computeSHA256(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target.result;
        const hashBuffer = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hexHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        resolve(hexHash);
      } catch (cryptoError) {
        reject(new Error(`Crypto digest failed: ${cryptoError.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error(`FileReader error: ${reader.error?.message ?? "Unknown read error"}`));
    };

    reader.onabort = () => {
      reject(new Error("File reading was aborted."));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Formats a file size in bytes into a human-readable string (KB or MB).
 *
 * @param {number} bytes - Size in bytes.
 * @returns {string} Formatted string, e.g. "512.00 KB" or "3.47 MB".
 */
export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(2)} KB`;
}
