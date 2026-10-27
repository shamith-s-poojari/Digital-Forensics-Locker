// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WalletContext } from "../context/walletContext.js";
import { LedgerProvider } from "./LedgerProvider.jsx";
import { useLedger } from "./ledgerContext.js";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const base = { address: null, chainId: 11155111, chainName: "Sepolia", explorerUrl: "", deployBlock: 0, configured: false, invalidAddress: false };
const configured = { ...base, address: CONTRACT, configured: true };

function Probe() {
  const { mode, ledger } = useLedger();
  return (
    <p data-testid="out">
      {mode}|{ledger?.kind ?? "no-ledger"}
    </p>
  );
}

function renderProvider({ config, account = ACCOUNT, chainId = 11155111, createLedger }) {
  const wallet = { account, chainId, connect: vi.fn(), disconnect: vi.fn(), switchChain: vi.fn(), error: null, isConnecting: false, clearError: vi.fn() };
  render(
    <WalletContext.Provider value={wallet}>
      <LedgerProvider config={config} createLedger={createLedger}>
        <Probe />
      </LedgerProvider>
    </WalletContext.Provider>
  );
  return screen.getByTestId("out").textContent;
}

beforeEach(() => {
  window.ethereum = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
});
afterEach(() => {
  cleanup();
  delete window.ethereum;
});

describe("LedgerProvider", () => {
  it("rejects a malformed contract address", () => {
    expect(renderProvider({ config: { ...base, invalidAddress: true } })).toBe("misconfigured|no-ledger");
  });

  describe("with a contract configured", () => {
    it("waits for a wallet", () => {
      expect(renderProvider({ config: configured, account: null })).toBe("no-wallet|no-ledger");
    });

    it("waits when no browser wallet exists at all", () => {
      delete window.ethereum;
      expect(renderProvider({ config: configured })).toBe("no-wallet|no-ledger");
    });

    it("waits while the wallet's network is not known yet", () => {
      expect(renderProvider({ config: configured, chainId: null })).toBe("checking-network|no-ledger");
    });

    it("refuses a wallet on the wrong network", () => {
      expect(renderProvider({ config: configured, chainId: 1 })).toBe("wrong-network|no-ledger");
    });

    it("connects to the real chain on the right network", () => {
      expect(renderProvider({ config: configured })).toBe("chain|chain");
    });

    it("applies the same wallet and network checks to an injected test ledger", () => {
      const createLedger = () => ({ kind: "memory" });
      expect(renderProvider({ config: configured, chainId: 1, createLedger })).toBe("wrong-network|no-ledger");
      cleanup();
      expect(renderProvider({ config: configured, account: null, createLedger })).toBe("no-wallet|no-ledger");
      cleanup();
      expect(renderProvider({ config: configured, createLedger })).toBe("chain|memory");
    });
  });

  describe("with no contract configured", () => {
    it("fails closed in every build: no ledger, nobody authorised", () => {
      expect(renderProvider({ config: base })).toBe("unconfigured|no-ledger");
    });

    it("does not use an injected test ledger either", () => {
      expect(renderProvider({ config: base, createLedger: () => ({ kind: "memory" }) })).toBe("unconfigured|no-ledger");
    });
  });
});
