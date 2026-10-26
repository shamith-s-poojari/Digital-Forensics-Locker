// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WalletContext } from "../../context/walletContext.js";
import { encryptEvidence, sha256Hex } from "../../crypto/evidenceCrypto.js";
import { makeFile } from "../../test/demoHarness.jsx";
import { RoleTestProvider } from "../../test/RoleTestProvider.jsx";
import EvidenceActions from "./EvidenceActions";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ORIGINAL = new TextEncoder().encode("original evidence bytes");
const record = { id: 3, custodian: ACCOUNT };
const ensureSession = vi.fn();
const keyClient = { storeKey: vi.fn(), fetchKey: vi.fn() };

let originalSha;
let ledger;

function renderActions() {
  render(
    <WalletContext.Provider value={{ account: ACCOUNT, ensureSession }}>
      <RoleTestProvider roles={{ isAuditor: true }}>
        <EvidenceActions record={record} ledger={ledger} account={ACCOUNT} paused={false} runWrite={vi.fn()} keyClient={keyClient} />
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

  it("reports a key-server refusal in its own words", async () => {
    const { envelope, keyId } = await encryptEvidence(ORIGINAL, originalSha);
    keyClient.fetchKey.mockRejectedValue(new Error("No key is stored for this file."));
    renderActions();
    choose(makeFile(envelope, `${keyId}.dfl`));

    expect((await screen.findByRole("alert")).textContent).toBe("No key is stored for this file.");
  });
});
