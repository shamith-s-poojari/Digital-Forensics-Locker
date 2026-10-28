/** Offers `data` to the user as a downloaded JSON file. */
export function downloadJson(filename, data) {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}

/** Offers raw bytes to the user as a downloaded file. */
export function downloadBytes(filename, bytes, type = "application/octet-stream") {
  downloadBlob(filename, new Blob([bytes], { type }));
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name that is safe on every platform. */
export function safeFileName(value, fallback = "export") {
  const cleaned = String(value ?? "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}
