import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CaseDirectoryProvider } from "../cases/CaseDirectoryProvider.jsx";
import { RoleProvider } from "../context/RoleContext.jsx";
import { WalletContext } from "../context/walletContext.js";
import { createMemoryCaseStore } from "./memoryCaseStore.js";
import { createMemoryLedger, createMemoryStore } from "./memoryLedger.js";
import { LedgerProvider } from "../web3/LedgerProvider.jsx";

export const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
export const OTHER_INVESTIGATOR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

// Module-level constants: the providers memoise on these, so they must keep the same identity across renders.
const NO_DELAY = { signDelayMs: 0, confirmDelayMs: 0 };
export const TEST_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CONFIG = { address: TEST_CONTRACT, chainId: 11155111, chainName: "Sepolia", explorerUrl: "", configured: true, deployBlock: 0, invalidAddress: false };

const walletFor = (account) => ({
  account,
  chainId: 11155111,
  connect: () => {},
  disconnect: () => {},
  switchChain: async () => true,
  error: null,
  isConnecting: false,
  clearError: () => {},
  session: account ? { address: account, chainId: 11155111, expiresAt: Number.MAX_SAFE_INTEGER } : null,
  isSignedIn: Boolean(account),
  isSigningIn: false,
  signIn: async () => ({ ok: true }),
  ensureSession: async () => ({ ok: true }),
  notice: null,
  clearNotice: () => {},
});
const wallets = new Map();
const stableWallet = (account) => {
  if (!wallets.has(account)) wallets.set(account, walletFor(account));
  return wallets.get(account);
};

/**
 * Renders `ui` inside the REAL wallet-context, ledger, case-directory and role providers, backed by the in-memory test
 * ledger instead of the contract, so tests exercise the same code paths as the app. Returns the ledger store for
 * arranging and checking ledger state.
 *
 * @param {import("react").ReactNode} ui
 * @param {object} [options]
 * @param {ReturnType<typeof createMemoryStore>} [options.store]  Defaults to a freshly seeded store.
 * @param {string | null} [options.account]                      The connected wallet.
 * @param {"none"|"auditor"|"investigator"|"admin"} [options.role] Role of that wallet (default investigator).
 * @param {string} [options.path]
 * @param {object} [options.caseStore]  Case store (default: an in-memory store seeded with the fixture cases).
 */
export function renderWithLedger(ui, { store = createMemoryStore(), account = ACCOUNT, role = "investigator", path = "/cases", caseStore = createMemoryCaseStore() } = {}) {
  if (account && role) store.setRole(account, role);
  const createLedger = (acting) => createMemoryLedger({ store, account: acting, ...NO_DELAY });
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <WalletContext.Provider value={stableWallet(account)}>
        <LedgerProvider config={CONFIG} createLedger={createLedger}>
          <CaseDirectoryProvider store={caseStore}>
            <RoleProvider>{ui}</RoleProvider>
          </CaseDirectoryProvider>
        </LedgerProvider>
      </WalletContext.Provider>
    </MemoryRouter>
  );
  return { ...utils, store };
}

/** A File that also works in jsdom versions that lack Blob.arrayBuffer(). */
export function makeFile(content, name, type = "text/plain") {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const file = new File([bytes], name, { type });
  if (typeof file.arrayBuffer !== "function") {
    file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return file;
}

export const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
