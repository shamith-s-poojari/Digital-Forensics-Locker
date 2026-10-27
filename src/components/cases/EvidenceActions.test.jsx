// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WalletContext } from "../../context/walletContext.js";
import { encryptEvidence, sha256Hex } from "../../crypto/evidenceCrypto.js";
import { makeFile } from "../../test/ledgerHarness.jsx";
import { RoleTestProvider } from "../../test/RoleTestProvider.jsx";
import EvidenceActions from "./EvidenceActions";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ORIGINAL = new TextEncoder().encode("original evidence bytes");
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const GATEWAYS = ["https://gw.example/ipfs/"];
const record = { id: 3, custodian: ACCOUNT, cid: CID };
const ensureSession = vi.fn();
const keyClient = { storeKey: vi.fn(), fetchKey: vi.fn() };

let originalSha;
let ledger;

function renderActions() {
  render(
    <WalletContext.Provider value={{ account: ACCOUNT, ensureSession }}>
      <RoleTestProvider roles={{ isAuditor: true }}>
        <EvidenceActions record={record} ledger={ledger} account={ACCOUNT} paused={false} runWrite={vi.fn()} keyClient={keyClient} gateways={GATEWAYS} />
      </RoleTestProvider>
    </WalletContext.Provider>
  );
}

const choose = (file) => fireEvent.change(screen.getByLabelText("Check a file against the ledger"), { target: { files: [file] } });

beforeEach(async () => {
  if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
  originalSha = await sha256Hex(ORIGINAL);
  ledger = { verifyHash: vi.fn(async (_id, hash) => hash === originalSha) };
  ensureSession.mockReset();
  ensureSession.mockResolvedValue({ ok: true });
  keyClient.fetchKey.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EvidenceActions: checking a file", () => {
  it("checks an original file locally, with no sign-in and no key request", async () => {
    renderActions();
    choose(makeFile(ORIGINAL, "photo.jpg"));

    await screen.findByText(/hash equals the hash registered/);
    expect(ledger.verifyHash).toHaveBeenCalledWith(3, originalSha);
    expect(ensureSession).not.toHaveBeenCalled();
    expect(keyClient.fetchKey).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save the decrypted file" })).toBeNull();
  });

  it("decrypts an encrypted copy with its escrowed key and checks the PLAINTEXT hash against the ledger", async () => {
    const { envelope, keyId, key } = await encryptEvidence(ORIGINAL, originalSha);
    keyClient.fetchKey.mockResolvedValue({ keyId, sha256: originalSha, key });
    renderActions();
    choose(makeFile(envelope, `${keyId}.dfl`, "application/octet-stream"));

    await screen.findByText(/hash equals the hash registered/);
    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(keyClient.fetchKey).toHaveBeenCalledWith(keyId);
    expect(ledger.verifyHash).toHaveBeenCalledWith(3, originalSha);
    expect(screen.getByText(/encrypted copy, decrypted in your browser/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save the decrypted file" })).toBeTruthy();
  });

  it("does not fetch a key when the sign-in check fails", async () => {
    const { envelope, keyId } = await encryptEvidence(ORIGINAL, originalSha);
    ensureSession.mockResolvedValue({ ok: false, error: "Your wallet is locked or disconnected. Unlock it and connect again." });
    renderActions();
    choose(makeFile(envelope, `${keyId}.dfl`));

    expect((await screen.findByRole("alert")).textContent).toMatch(/locked or disconnected/);
    expect(keyClient.fetchKey).not.toHaveBeenCalled();
  });

  it("reports a key that does not open the file", async () => {
    const { envelope, keyId } = await encryptEvidence(ORIGINAL, originalSha);
    const other = await encryptEvidence(ORIGINAL, originalSha);
    keyClient.fetchKey.mockResolvedValue({ keyId, sha256: originalSha, key: other.key });
    renderActions();
    choose(makeFile(envelope, `${keyId}.dfl`));

    expect((await screen.findByRole("alert")).textContent).toMatch(/Decryption failed/);
  });

  it("reports a mismatch, and offers no download, when the decrypted bytes are not the registered evidence", async () => {
    const otherBytes = new TextEncoder().encode("different evidence");
    const { envelope, keyId, key } = await encryptEvidence(otherBytes, await sha256Hex(otherBytes));
    keyClient.fetchKey.mockResolvedValue({ keyId, key });
    renderActions();
    choose(makeFile(envelope, `${keyId}.dfl`));

    await screen.findByText(/does NOT match the hash registered/);
    expect(screen.queryByRole("button", { name: "Save the decrypted file" })).toBeNull();
  });

  it("fetches the stored copy from IPFS by its CID, decrypts it and verifies it against the ledger", async () => {
    const { envelope, key } = await encryptEvidence(ORIGINAL, originalSha);
    keyClient.fetchKey.mockResolvedValue({ key });
    const fetchStub = vi.fn().mockResolvedValue(new Response(envelope, { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Fetch from IPFS and verify" }));

    await screen.findByText(/hash equals the hash registered/);
    expect(fetchStub.mock.calls[0][0]).toBe(`https://gw.example/ipfs/${CID}`);
    expect(ledger.verifyHash).toHaveBeenCalledWith(3, originalSha);
    expect(screen.getByText(/via gw\.example \(encrypted copy, decrypted in your browser\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save the decrypted file" })).toBeTruthy();
  });

  it("reports a gateway failure plainly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 504 })));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Fetch from IPFS and verify" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not fetch the stored copy from IPFS \(gw\.example: HTTP 504\)/);
  });

  it("reports a key-server refusal in its own words", async () => {
    const { envelope, keyId } = await encryptEvidence(ORIGINAL, originalSha);
    keyClient.fetchKey.mockRejectedValue(new Error("No key is stored for this file."));
    renderActions();
    choose(makeFile(envelope, `${keyId}.dfl`));

    expect((await screen.findByRole("alert")).textContent).toBe("No key is stored for this file.");
  });
});
