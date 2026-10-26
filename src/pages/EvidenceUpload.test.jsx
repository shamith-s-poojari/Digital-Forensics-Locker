// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { WalletContext } from "../context/walletContext.js";
import { makeFile, SHA256_ABC } from "../test/demoHarness.jsx";
import { deriveCaseRef } from "../web3/format.js";
import { LedgerContext } from "../web3/ledgerContext.js";
import { LedgerError, LEDGER_ERROR } from "../web3/ledgerErrors.js";
import { decryptEvidence, readEnvelopeHeader } from "../crypto/evidenceCrypto.js";
import { uploadToIPFSWithProgress } from "../utils/ipfs";
import EvidenceUpload from "./EvidenceUpload";

vi.mock("../utils/ipfs", () => ({ uploadToIPFSWithProgress: vi.fn() }));

const TX_HASH = `0x${"ab".repeat(32)}`;
const config = {
  address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  chainId: 11155111,
  chainName: "Sepolia",
  explorerUrl: "https://sepolia.etherscan.io",
  configured: true,
  deployBlock: 0,
  invalidAddress: false,
};
const ensureSession = vi.fn();
const keyClient = { storeKey: vi.fn(), fetchKey: vi.fn() };
/** jsdom's File may lack arrayBuffer(); FileReader works everywhere. */
const readBytes = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
const pinnedFile = (call = 0) => uploadToIPFSWithProgress.mock.calls[call][0];
const wallet = { account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", chainId: 11155111, connect() {}, disconnect() {}, switchChain: async () => true, error: null, isConnecting: false, clearError() {}, ensureSession };

function makeLedger(overrides = {}) {
  const wait = vi.fn().mockResolvedValue({ hash: TX_HASH, blockNumber: 42, evidenceId: 7 });
  return {
    kind: "chain",
    isPaused: vi.fn().mockResolvedValue(false),
    findEvidence: vi.fn().mockResolvedValue(null),
    registerEvidence: vi.fn().mockResolvedValue({ hash: TX_HASH, wait }),
    wait,
    ...overrides,
  };
}

function renderUpload(ledger = makeLedger()) {
  render(
    <MemoryRouter>
      <WalletContext.Provider value={wallet}>
        <LedgerContext.Provider value={{ mode: "chain", ledger, config }}>
          <EvidenceUpload keyClient={keyClient} />
        </LedgerContext.Provider>
      </WalletContext.Provider>
    </MemoryRouter>
  );
  return ledger;
}

const fileInput = () => screen.getByLabelText(/Choose a file or drag it here/);
const chooseFile = (file) => fireEvent.change(fileInput(), { target: { files: [file] } });
const submit = () => screen.getByRole("button", { name: /Encrypt, pin and register|Working/ });
const step = (label) => screen.getByText(label).closest("li");

async function fillAndChoose(caseNumber = "CASE-1", file = makeFile("abc", "evidence.txt")) {
  if (caseNumber) await userEvent.type(screen.getByLabelText("Case number"), caseNumber);
  chooseFile(file);
  await waitFor(() => expect(step("Compute SHA-256 in your browser").dataset.status).toBe("done"));
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
  uploadToIPFSWithProgress.mockReset();
  uploadToIPFSWithProgress.mockResolvedValue("QmPinnedCid");
  ensureSession.mockReset();
  ensureSession.mockResolvedValue({ ok: true });
  keyClient.storeKey.mockReset();
  keyClient.storeKey.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EvidenceUpload: before submitting", () => {
  it("says plainly that only an encrypted copy is pinned, and that IPFS is public", () => {
    renderUpload();
    expect(screen.getByRole("note").textContent).toMatch(/encrypted in your browser/i);
    expect(screen.getByRole("note").textContent).toMatch(/public/i);
  });

  it("labels its controls and lists the five stages", () => {
    renderUpload();
    expect(screen.getByLabelText("Case number")).toBeTruthy();
    expect(fileInput().type).toBe("file");
    const labels = within(screen.getByLabelText("Progress")).getAllByRole("listitem").map((li) => li.textContent.replace(/: Not started$/, ""));
    expect(labels).toEqual(["Compute SHA-256 in your browser", "Encrypt in your browser and store the key", "Pin the encrypted copy to IPFS", "Approve in your wallet", "Confirm on the ledger"]);
  });

  it("keeps the submit button disabled until a file has been hashed", async () => {
    renderUpload();
    expect(submit().disabled).toBe(true);
    chooseFile(makeFile("abc", "evidence.txt"));
    await waitFor(() => expect(submit().disabled).toBe(false));
  });

  it("hashes the chosen file locally and shows its SHA-256 and size", async () => {
    renderUpload();
    await fillAndChoose("");
    expect(screen.getByText("evidence.txt")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy SHA-256" }).closest("span").textContent).toContain(SHA256_ABC.slice(0, 12));
    expect(uploadToIPFSWithProgress).not.toHaveBeenCalled(); // choosing a file uploads nothing
  });

  it("asks for a case number and does nothing else when it is missing", async () => {
    const ledger = renderUpload();
    await fillAndChoose("");
    await userEvent.click(submit());
    expect((await screen.findByText("Enter the case number this evidence belongs to.")).getAttribute("role")).toBe("alert");
    expect(ledger.findEvidence).not.toHaveBeenCalled();
    expect(uploadToIPFSWithProgress).not.toHaveBeenCalled();
  });

  it("rejects a file that is too large to hash and keeps submit disabled", async () => {
    renderUpload();
    const big = makeFile("x", "big.bin");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    chooseFile(big);
    expect((await screen.findByRole("alert")).textContent).toMatch(/limited to 10\.00 MB/);
    expect(submit().disabled).toBe(true);
  });

  it("lets the user remove the file", async () => {
    renderUpload();
    await fillAndChoose("");
    await userEvent.click(screen.getByRole("button", { name: "Remove evidence.txt" }));
    expect(screen.queryByText("evidence.txt")).toBeNull();
    expect(submit().disabled).toBe(true);
  });

  it("disables registering while the ledger is paused", async () => {
    renderUpload(makeLedger({ isPaused: vi.fn().mockResolvedValue(true) }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/paused the ledger/i);
    chooseFile(makeFile("abc", "evidence.txt"));
    await waitFor(() => expect(step("Compute SHA-256 in your browser").dataset.status).toBe("done"));
    expect(submit().disabled).toBe(true);
  });
});

describe("EvidenceUpload: registering", () => {
  it("hashes, encrypts, pins, signs and confirms, then shows the result with an explorer link", async () => {
    const ledger = renderUpload();
    const file = makeFile("abc", "evidence.txt");
    await fillAndChoose("case-2025-0042", file);

    await userEvent.click(submit());

    await screen.findByText("Evidence #7 recorded");
    for (const label of ["Compute SHA-256 in your browser", "Encrypt in your browser and store the key", "Pin the encrypted copy to IPFS", "Approve in your wallet", "Confirm on the ledger"]) {
      expect(step(label).dataset.status).toBe("done");
    }
    expect(screen.getByText("Included in block 42.")).toBeTruthy();

    // What was pinned: NOT the original file, but an encrypted copy under a neutral name, which decrypts with the
    // escrowed key back to the original bytes.
    const [{ keyId, sha256, key }] = keyClient.storeKey.mock.calls[0];
    expect(sha256).toBe(SHA256_ABC);
    const pinned = pinnedFile();
    expect(pinned).not.toBe(file);
    expect(pinned.name).toBe(`${keyId}.dfl`);
    expect(pinned.type).toBe("application/octet-stream");
    const envelope = await readBytes(pinned);
    expect(readEnvelopeHeader(envelope)).toMatchObject({ keyId, sha256: SHA256_ABC });
    const opened = await decryptEvidence(envelope, key);
    expect(new TextDecoder().decode(opened.plaintext)).toBe("abc");
    // The ledger gets the PLAINTEXT hash, the CID of the encrypted copy, and an opaque (normalised) case reference.
    expect(ledger.registerEvidence).toHaveBeenCalledWith({ caseRef: deriveCaseRef("CASE-2025-0042"), sha256: SHA256_ABC, cid: "QmPinnedCid" });
    expect(screen.getByRole("button", { name: "Copy decryption key id" }).closest("span").textContent).toContain(keyId.slice(0, 8));
    // The transaction is linked from the progress panel and from the result card; both go to the same place.
    const links = screen.getAllByRole("link", { name: /View the transaction/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link.getAttribute("href")).toBe(`https://sepolia.etherscan.io/tx/${TX_HASH}`);
    expect(screen.getByRole("link", { name: "View in the dashboard" }).getAttribute("href")).toBe("/cases");
  });

  it("shows real upload progress while the file is being pinned", async () => {
    let finish;
    let report;
    uploadToIPFSWithProgress.mockImplementation((_file, { onProgress }) => {
      report = onProgress;
      return new Promise((resolve) => (finish = resolve));
    });
    renderUpload();
    await fillAndChoose();
    await userEvent.click(submit());

    await waitFor(() => expect(report).toBeTypeOf("function"));
    act(() => report(40));
    const bar = await screen.findByRole("progressbar", { name: "Pin the encrypted copy to IPFS progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("Uploading… 40%")).toBeTruthy();
    expect(submit().disabled).toBe(true); // cannot double-submit while working

    act(() => report(100));
    expect(screen.getByText(/Waiting for Pinata to confirm/)).toBeTruthy();

    await act(async () => finish("QmSlow"));
    await screen.findByText("Evidence #7 recorded");
  });

  it("stops before uploading anything when the ledger already has this file for this case", async () => {
    const ledger = renderUpload(makeLedger({ findEvidence: vi.fn().mockResolvedValue(5) }));
    await fillAndChoose();
    await userEvent.click(submit());

    expect((await screen.findByRole("alert")).textContent).toMatch(/already registered for this case as evidence #5/);
    expect(uploadToIPFSWithProgress).not.toHaveBeenCalled();
    expect(ledger.registerEvidence).not.toHaveBeenCalled();
  });

  it("reports a failed pin against the pin step and registers nothing; a retry then succeeds", async () => {
    uploadToIPFSWithProgress.mockRejectedValueOnce(new Error("IPFS upload is not configured on the server."));
    const ledger = renderUpload();
    await fillAndChoose();

    await userEvent.click(submit());
    await waitFor(() => expect(step("Pin the encrypted copy to IPFS").dataset.status).toBe("error"));
    expect(within(step("Pin the encrypted copy to IPFS")).getByText("IPFS upload is not configured on the server.")).toBeTruthy();
    expect(ledger.registerEvidence).not.toHaveBeenCalled();

    await userEvent.click(submit());
    await screen.findByText("Evidence #7 recorded");
    expect(uploadToIPFSWithProgress).toHaveBeenCalledTimes(2);
    // The retry pins the SAME encrypted copy: no second key, no orphaned key in the store.
    expect(keyClient.storeKey).toHaveBeenCalledTimes(1);
    expect(pinnedFile(1).name).toBe(pinnedFile(0).name);
  });

  it("pins nothing when the decryption key cannot be stored", async () => {
    keyClient.storeKey.mockRejectedValueOnce(new Error("Evidence encryption is not configured on the server."));
    const ledger = renderUpload();
    await fillAndChoose();

    await userEvent.click(submit());
    await waitFor(() => expect(step("Encrypt in your browser and store the key").dataset.status).toBe("error"));
    expect(within(step("Encrypt in your browser and store the key")).getByText(/not configured on the server/)).toBeTruthy();
    expect(uploadToIPFSWithProgress).not.toHaveBeenCalled();
    expect(ledger.registerEvidence).not.toHaveBeenCalled();
  });

  it("uploads nothing when the sign-in check fails (wallet switched, locked or sign-in declined)", async () => {
    ensureSession.mockResolvedValueOnce({ ok: false, error: "Your wallet switched to 0x3C44…93BC. Nothing was sent." });
    const ledger = renderUpload();
    await fillAndChoose();

    await userEvent.click(submit());
    await waitFor(() => expect(step("Encrypt in your browser and store the key").dataset.status).toBe("error"));
    expect(within(step("Encrypt in your browser and store the key")).getByText(/Your wallet switched/)).toBeTruthy();
    expect(keyClient.storeKey).not.toHaveBeenCalled();
    expect(uploadToIPFSWithProgress).not.toHaveBeenCalled();
    expect(ledger.registerEvidence).not.toHaveBeenCalled();
  });

  it("re-checks the sign-in before the transaction even when the file was already pinned", async () => {
    const ledger = makeLedger();
    ledger.registerEvidence.mockRejectedValueOnce(new LedgerError(LEDGER_ERROR.USER_REJECTED));
    renderUpload(ledger);
    await fillAndChoose();
    await userEvent.click(submit());
    await waitFor(() => expect(step("Approve in your wallet").dataset.status).toBe("error"));

    ensureSession.mockResolvedValueOnce({ ok: false, error: "Sign-in was cancelled." });
    await userEvent.click(submit());
    await waitFor(() => expect(within(step("Approve in your wallet")).getByText("Sign-in was cancelled.")).toBeTruthy());
    expect(ledger.registerEvidence).toHaveBeenCalledTimes(1);
  });

  it("keeps the pin when the wallet signature is rejected, and does not upload again on retry", async () => {
    const ledger = makeLedger();
    ledger.registerEvidence.mockRejectedValueOnce(new LedgerError(LEDGER_ERROR.USER_REJECTED));
    renderUpload(ledger);
    await fillAndChoose();

    await userEvent.click(submit());
    await waitFor(() => expect(step("Approve in your wallet").dataset.status).toBe("error"));
    expect(within(step("Approve in your wallet")).getByText(/You rejected the request in your wallet/)).toBeTruthy();
    expect(step("Pin the encrypted copy to IPFS").dataset.status).toBe("done");
    expect(screen.getByText("IPFS CID").closest("p").textContent).toContain("QmPinnedC"); // still shown for the user

    await userEvent.click(submit());
    await screen.findByText("Evidence #7 recorded");
    expect(uploadToIPFSWithProgress).toHaveBeenCalledTimes(1); // pinned once, registered on the second try
    expect(within(step("Pin the encrypted copy to IPFS")).getByText(/Already pinned earlier/)).toBeTruthy();
  });

  it("explains a contract refusal (no permission) against the signing step", async () => {
    const ledger = makeLedger();
    ledger.registerEvidence.mockRejectedValue(new LedgerError(LEDGER_ERROR.NOT_AUTHORIZED));
    renderUpload(ledger);
    await fillAndChoose();
    await userEvent.click(submit());

    await waitFor(() => expect(step("Approve in your wallet").dataset.status).toBe("error"));
    expect(within(step("Approve in your wallet")).getByText(/not authorised for this action/)).toBeTruthy();
    expect(screen.queryByText(/recorded$/)).toBeNull();
  });

  it("reports a transaction that fails after it was sent against the confirmation step", async () => {
    const ledger = makeLedger();
    ledger.wait.mockRejectedValue(new LedgerError(LEDGER_ERROR.NETWORK));
    renderUpload(ledger);
    await fillAndChoose();
    await userEvent.click(submit());

    await waitFor(() => expect(step("Confirm on the ledger").dataset.status).toBe("error"));
    expect(step("Approve in your wallet").dataset.status).toBe("done");
  });

  it("discards a pin that belongs to a different file", async () => {
    const ledger = makeLedger();
    ledger.registerEvidence.mockRejectedValueOnce(new LedgerError(LEDGER_ERROR.USER_REJECTED));
    renderUpload(ledger);
    await fillAndChoose("CASE-1", makeFile("abc", "first.txt"));
    await userEvent.click(submit());
    await waitFor(() => expect(step("Approve in your wallet").dataset.status).toBe("error"));

    chooseFile(makeFile("different bytes", "second.txt"));
    await waitFor(() => expect(screen.getByText("second.txt")).toBeTruthy());
    await waitFor(() => expect(step("Compute SHA-256 in your browser").dataset.status).toBe("done"));
    await userEvent.click(submit());
    await screen.findByText("Evidence #7 recorded");
    expect(uploadToIPFSWithProgress).toHaveBeenCalledTimes(2); // the second file had to be pinned itself
    expect(keyClient.storeKey).toHaveBeenCalledTimes(2); // with its own key
  });

  it("starts over after a successful registration", async () => {
    renderUpload();
    await fillAndChoose();
    await userEvent.click(submit());
    await screen.findByText("Evidence #7 recorded");

    await userEvent.click(screen.getByRole("button", { name: "Register another" }));
    expect(screen.queryByText("Evidence #7 recorded")).toBeNull();
    expect(screen.getByLabelText("Case number").value).toBe("");
    expect(submit().disabled).toBe(true);
  });
});
