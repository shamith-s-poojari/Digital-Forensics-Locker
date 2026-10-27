import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptEvidence, sha256Hex } from "../crypto/evidenceCrypto.js";
import { fetchFromIpfs } from "./ipfsFetch.js";
import { verifyStoredCopy } from "./verifyEvidence.js";

const GATEWAYS = ["https://one.example/ipfs/", "https://two.example/ipfs/"];
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const ORIGINAL = new TextEncoder().encode("the original evidence bytes");

const respond = (bytes, init = {}) => new Response(bytes, { status: 200, ...init });

describe("fetchFromIpfs", () => {
  it("asks the gateways in order and returns the first good answer", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(respond(ORIGINAL));
    const { bytes, gateway } = await fetchFromIpfs(CID, { gateways: GATEWAYS, maxBytes: 1000, fetchImpl });

    expect(gateway).toBe(GATEWAYS[1]);
    expect(new TextDecoder().decode(bytes)).toBe("the original evidence bytes");
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([`${GATEWAYS[0]}${CID}`, `${GATEWAYS[1]}${CID}`]);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("never builds a URL from a CID with anything but CID characters", async () => {
    const fetchImpl = vi.fn();
    for (const bad of ["../../etc", "Qm?x=1", "Qm/../../admin", "https://evil.example/x", ""]) {
      await expect(fetchFromIpfs(bad, { gateways: GATEWAYS, maxBytes: 1000, fetchImpl })).rejects.toThrow(/not a valid content identifier/);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses an oversized answer, by declared length or while reading", async () => {
    const declared = vi.fn().mockResolvedValue(respond(ORIGINAL, { headers: { "content-length": "5000" } }));
    await expect(fetchFromIpfs(CID, { gateways: GATEWAYS.slice(0, 1), maxBytes: 100, fetchImpl: declared })).rejects.toThrow(/larger than the verification limit/);

    const streamed = vi.fn().mockResolvedValue(respond(new Uint8Array(500)));
    await expect(fetchFromIpfs(CID, { gateways: GATEWAYS.slice(0, 1), maxBytes: 100, fetchImpl: streamed })).rejects.toThrow(/larger than the verification limit/);
  });

  it("names every gateway that failed, and why", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("", { status: 504 })).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchFromIpfs(CID, { gateways: GATEWAYS, maxBytes: 1000, fetchImpl })).rejects.toThrow(/one\.example: HTTP 504; two\.example: Failed to fetch/);
  });
});

describe("verifyStoredCopy", () => {
  let sha;
  let ledger;
  const ensureSession = vi.fn();
  const keyClient = { fetchKey: vi.fn() };

  beforeEach(async () => {
    sha = await sha256Hex(ORIGINAL);
    ledger = { verifyHash: vi.fn(async (_id, hash) => hash === sha) };
    ensureSession.mockReset().mockResolvedValue({ ok: true });
    keyClient.fetchKey.mockReset();
  });

  it("fetches the encrypted copy, decrypts it, hashes the ORIGINAL bytes and confirms them against the ledger", async () => {
    const { envelope, keyId, key } = await encryptEvidence(ORIGINAL, sha);
    keyClient.fetchKey.mockResolvedValue({ key });
    const fetchImpl = vi.fn().mockResolvedValue(respond(envelope));

    const result = await verifyStoredCopy({ record: { id: 4, cid: CID }, ledger, gateways: GATEWAYS, ensureSession, keyClient, fetchImpl });

    expect(result).toMatchObject({ gateway: GATEWAYS[0], encrypted: true, sha256: sha, matches: true });
    expect(new TextDecoder().decode(result.plaintext)).toBe("the original evidence bytes");
    expect(keyClient.fetchKey).toHaveBeenCalledWith(keyId);
    expect(ledger.verifyHash).toHaveBeenCalledWith(4, sha);
  });

  it("cannot be fooled by a gateway that alters the bytes: decryption fails instead", async () => {
    const { envelope, key } = await encryptEvidence(ORIGINAL, sha);
    keyClient.fetchKey.mockResolvedValue({ key });
    envelope[envelope.length - 20] ^= 0xff;
    const fetchImpl = vi.fn().mockResolvedValue(respond(envelope));

    await expect(verifyStoredCopy({ record: { id: 4, cid: CID }, ledger, gateways: GATEWAYS, ensureSession, keyClient, fetchImpl })).rejects.toThrow(/Decryption failed/);
    expect(ledger.verifyHash).not.toHaveBeenCalled();
  });

  it("reports a mismatch when the stored copy is not the registered evidence", async () => {
    const other = new TextEncoder().encode("something else");
    const { envelope, key } = await encryptEvidence(other, await sha256Hex(other));
    keyClient.fetchKey.mockResolvedValue({ key });
    const result = await verifyStoredCopy({ record: { id: 4, cid: CID }, ledger, gateways: GATEWAYS, ensureSession, keyClient, fetchImpl: vi.fn().mockResolvedValue(respond(envelope)) });
    expect(result.matches).toBe(false);
  });

  it("hashes an unencrypted copy (pinned before encryption existed) without any key or sign-in", async () => {
    const result = await verifyStoredCopy({ record: { id: 4, cid: CID }, ledger, gateways: GATEWAYS, ensureSession, keyClient, fetchImpl: vi.fn().mockResolvedValue(respond(ORIGINAL)) });
    expect(result).toMatchObject({ encrypted: false, matches: true, plaintext: null });
    expect(ensureSession).not.toHaveBeenCalled();
    expect(keyClient.fetchKey).not.toHaveBeenCalled();
  });

  it("does not fetch a key without a current sign-in", async () => {
    const { envelope } = await encryptEvidence(ORIGINAL, sha);
    ensureSession.mockResolvedValue({ ok: false, error: "Your wallet is locked or disconnected. Unlock it and connect again." });
    await expect(
      verifyStoredCopy({ record: { id: 4, cid: CID }, ledger, gateways: GATEWAYS, ensureSession, keyClient, fetchImpl: vi.fn().mockResolvedValue(respond(envelope)) })
    ).rejects.toThrow(/locked or disconnected/);
    expect(keyClient.fetchKey).not.toHaveBeenCalled();
  });
});
