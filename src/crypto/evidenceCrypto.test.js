import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, decryptEvidence, encryptEvidence, HEADER_BYTES, readEnvelopeHeader, sha256Hex } from "./evidenceCrypto.js";

const PLAINTEXT = new TextEncoder().encode("evidence bytes: the quick brown fox");
const SHA = await sha256Hex(PLAINTEXT);

describe("evidenceCrypto", () => {
  it("round-trips: decrypting gives back the original bytes and their SHA-256", async () => {
    const { envelope, keyId, key } = await encryptEvidence(PLAINTEXT, SHA);
    const result = await decryptEvidence(envelope, key);

    expect(Array.from(result.plaintext)).toEqual(Array.from(PLAINTEXT));
    expect(result.sha256).toBe(SHA);
    expect(result.matchesHeader).toBe(true);
    expect(result.keyId).toBe(keyId);
  });

  it("writes a header naming the key and the PLAINTEXT hash, and never contains the plaintext", async () => {
    const { envelope, keyId } = await encryptEvidence(PLAINTEXT, SHA);
    const header = readEnvelopeHeader(envelope);

    expect(header).toMatchObject({ version: 1, keyId, sha256: SHA });
    expect(keyId).toMatch(/^[0-9a-f]{32}$/);
    expect(envelope.length).toBe(HEADER_BYTES + PLAINTEXT.length + 16);
    expect(new TextDecoder().decode(envelope)).not.toContain("quick brown fox");
  });

  it("uses a new key, key id and IV for every file, even the same file twice", async () => {
    const a = await encryptEvidence(PLAINTEXT, SHA);
    const b = await encryptEvidence(PLAINTEXT, SHA);
    expect(a.key).not.toBe(b.key);
    expect(a.keyId).not.toBe(b.keyId);
    expect(Array.from(readEnvelopeHeader(a.envelope).iv)).not.toEqual(Array.from(readEnvelopeHeader(b.envelope).iv));
    expect(base64ToBytes(a.key)).toHaveLength(32);
  });

  it("refuses to encrypt when the bytes do not match the hash given (the file changed after hashing)", async () => {
    await expect(encryptEvidence(PLAINTEXT, "0".repeat(64))).rejects.toThrow(/changed after it was hashed/);
    await expect(encryptEvidence(PLAINTEXT, "not a hash")).rejects.toThrow(TypeError);
  });

  it("detects a modified ciphertext", async () => {
    const { envelope, key } = await encryptEvidence(PLAINTEXT, SHA);
    envelope[HEADER_BYTES + 3] ^= 0x01;
    await expect(decryptEvidence(envelope, key)).rejects.toThrow(/key does not match, or the encrypted file was modified/);
  });

  it("detects a modified header (for example a swapped plaintext hash), because the header is authenticated", async () => {
    const { envelope, key } = await encryptEvidence(PLAINTEXT, SHA);
    envelope[40] ^= 0x01; // inside the SHA-256 field
    await expect(decryptEvidence(envelope, key)).rejects.toThrow(/modified/);
  });

  it("rejects the wrong key", async () => {
    const { envelope } = await encryptEvidence(PLAINTEXT, SHA);
    const other = await encryptEvidence(PLAINTEXT, SHA);
    await expect(decryptEvidence(envelope, other.key)).rejects.toThrow(/key does not match/);
    await expect(decryptEvidence(envelope, bytesToBase64(new Uint8Array(16)))).rejects.toThrow(/key does not match/);
  });

  it("does not mistake an ordinary file for an encrypted copy", async () => {
    expect(readEnvelopeHeader(PLAINTEXT)).toBeNull();
    expect(readEnvelopeHeader(new TextEncoder().encode(`DFLENC${"x".repeat(100)}`))).toBeNull(); // wrong version byte
    await expect(decryptEvidence(PLAINTEXT, bytesToBase64(new Uint8Array(32)))).rejects.toThrow(/not an encrypted evidence file/);
  });

  it("accepts Blobs as input", async () => {
    const { envelope, key } = await encryptEvidence(new Blob([PLAINTEXT]), SHA);
    expect((await decryptEvidence(new Blob([envelope]), key)).sha256).toBe(SHA);
  });
});
