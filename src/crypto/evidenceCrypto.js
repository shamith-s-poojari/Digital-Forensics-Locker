// Client-side encryption of evidence before it leaves the browser.
//
// Each file gets its own random AES-256-GCM key. The pinned bytes are an "envelope":
//
//   offset  size  field
//   0       6     magic "DFLENC"
//   6       1     envelope version (1)
//   7       1     algorithm (1 = AES-256-GCM, 128-bit tag)
//   8       16    key id (random; the server key store looks the key up by it)
//   24      12    IV (random, never reused: every key encrypts exactly one file)
//   36      32    SHA-256 of the PLAINTEXT (the hash registered on the ledger)
//   68      ...   ciphertext followed by the 16-byte GCM tag
//
// The whole 68-byte header is the GCM "additional data", so changing any header byte (for example to claim another
// plaintext hash or key id) makes decryption fail. The SHA-256 is of the original bytes, computed before encryption,
// so verification always refers to the evidence itself, not to this encrypted copy.

const MAGIC = new TextEncoder().encode("DFLENC");
export const ENVELOPE_VERSION = 1;
const ALG_AES_256_GCM = 1;
export const HEADER_BYTES = 68;
const TAG_BYTES = 16;
const HEX_64 = /^[0-9a-f]{64}$/;

function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Encryption is unavailable: the Web Crypto API requires a secure context (HTTPS or localhost).");
  return s;
}

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16));

export function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(text) {
  const binary = atob(text);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// Realm-safe checks (`instanceof` fails for arrays made in another window, iframe or test environment).
const isByteView = (value) => ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]";
const isArrayBuffer = (value) => Object.prototype.toString.call(value) === "[object ArrayBuffer]";

async function toBytes(input) {
  if (isByteView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (isArrayBuffer(input)) return new Uint8Array(input);
  if (typeof input?.arrayBuffer === "function") return new Uint8Array(await input.arrayBuffer());
  throw new TypeError("Expected a Blob, File, ArrayBuffer or Uint8Array");
}

/** Lowercase hex SHA-256 of raw bytes. */
export async function sha256Hex(bytes) {
  return toHex(new Uint8Array(await subtle().digest("SHA-256", bytes)));
}

/**
 * Reads an envelope header. Returns null when `bytes` is not an encrypted evidence file.
 *
 * @param {Uint8Array} bytes
 * @returns {{ version: number, keyId: string, iv: Uint8Array, sha256: string, header: Uint8Array } | null}
 */
export function readEnvelopeHeader(bytes) {
  if (!isByteView(bytes) || bytes.length < HEADER_BYTES + TAG_BYTES) return null;
  for (let i = 0; i < MAGIC.length; i += 1) if (bytes[i] !== MAGIC[i]) return null;
  if (bytes[6] !== ENVELOPE_VERSION || bytes[7] !== ALG_AES_256_GCM) return null;
  return {
    version: bytes[6],
    keyId: toHex(bytes.subarray(8, 24)),
    iv: bytes.slice(24, 36),
    sha256: toHex(bytes.subarray(36, 68)),
    header: bytes.slice(0, HEADER_BYTES),
  };
}

/**
 * Encrypts `plaintext` under a fresh random key.
 *
 * @param {Blob | ArrayBuffer | Uint8Array} plaintext
 * @param {string} sha256 Hex SHA-256 of `plaintext`, computed by the caller BEFORE encryption. It is re-checked here,
 *        so an envelope can never claim a hash its contents do not have.
 * @returns {Promise<{ envelope: Uint8Array, keyId: string, key: string }>} `key` is the raw key, base64. The caller
 *          hands it to the key store and must not keep it.
 */
export async function encryptEvidence(plaintext, sha256) {
  const bytes = await toBytes(plaintext);
  const expected = String(sha256).toLowerCase();
  if (!HEX_64.test(expected)) throw new TypeError("Expected the 64-character hex SHA-256 of the plaintext");
  if ((await sha256Hex(bytes)) !== expected) throw new Error("The file changed after it was hashed. Choose it again.");

  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const keyId = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const header = new Uint8Array(HEADER_BYTES);
  header.set(MAGIC, 0);
  header[6] = ENVELOPE_VERSION;
  header[7] = ALG_AES_256_GCM;
  header.set(keyId, 8);
  header.set(iv, 24);
  header.set(fromHex(expected), 36);

  try {
    const key = await subtle().importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
    const ciphertext = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: header, tagLength: 128 }, key, bytes));
    const envelope = new Uint8Array(HEADER_BYTES + ciphertext.length);
    envelope.set(header, 0);
    envelope.set(ciphertext, HEADER_BYTES);
    return { envelope, keyId: toHex(keyId), key: bytesToBase64(rawKey) };
  } finally {
    rawKey.fill(0); // best effort: the base64 copy returned above is the only one left
  }
}

/**
 * Decrypts an envelope and re-hashes the result.
 *
 * @param {Blob | ArrayBuffer | Uint8Array} envelope
 * @param {string} key Raw key, base64 (from the key store).
 * @returns {Promise<{ plaintext: Uint8Array, sha256: string, keyId: string, matchesHeader: boolean }>}
 *          `sha256` is computed from the decrypted bytes; `matchesHeader` says whether it equals the hash the header claims.
 */
export async function decryptEvidence(envelope, key) {
  const bytes = await toBytes(envelope);
  const header = readEnvelopeHeader(bytes);
  if (!header) throw new Error("This is not an encrypted evidence file (or it uses an unknown format version).");

  const rawKey = base64ToBytes(key);
  let plaintext;
  try {
    if (rawKey.length !== 32) throw new Error("bad key length");
    const cryptoKey = await subtle().importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
    plaintext = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: header.iv, additionalData: header.header, tagLength: 128 }, cryptoKey, bytes.subarray(HEADER_BYTES)));
  } catch (err) {
    throw new Error("Decryption failed: the key does not match, or the encrypted file was modified.", { cause: err });
  } finally {
    rawKey.fill(0);
  }

  const sha256 = await sha256Hex(plaintext);
  return { plaintext, sha256, keyId: header.keyId, matchesHeader: sha256 === header.sha256 };
}
