import { describe, expect, it, vi } from "vitest";
import abi from "./EvidenceLocker.abi.json";
import { createEthersLedger } from "./ethersLedger.js";
import { LEDGER_ERROR } from "./ledgerErrors.js";

const ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function ledgerWith({ balance, maxFeePerGas = null, gasPrice = null }) {
  const provider = { getBalance: vi.fn().mockResolvedValue(balance), getFeeData: vi.fn().mockResolvedValue({ maxFeePerGas, gasPrice }) };
  return createEthersLedger({ provider, getSigner: async () => null, address: ADDRESS, abi });
}

describe("ethersLedger: fees on transactions", () => {
  /** A ledger whose wallet records what it was asked to send. */
  function ledgerWithSigner(getFeeData) {
    const provider = { getFeeData };
    const sendTransaction = vi.fn().mockResolvedValue({ hash: `0x${"ab".repeat(32)}` });
    const ledger = createEthersLedger({ provider, getSigner: async () => ({ provider, sendTransaction }), address: ADDRESS, abi });
    return { ledger, sent: () => sendTransaction.mock.calls[0][0] };
  }

  it("passes the network's suggested fee to the wallet", async () => {
    const { ledger, sent } = ledgerWithSigner(vi.fn().mockResolvedValue({ maxFeePerGas: 40n, maxPriorityFeePerGas: 2n }));
    await ledger.pause();
    expect(sent().maxFeePerGas).toBe(40n);
    expect(sent().maxPriorityFeePerGas).toBe(2n);
  });

  it("leaves the fee to the wallet when the network offers no EIP-1559 suggestion", async () => {
    const { ledger, sent } = ledgerWithSigner(vi.fn().mockResolvedValue({ gasPrice: 5n, maxFeePerGas: null, maxPriorityFeePerGas: null }));
    await ledger.pause();
    expect(sent().maxFeePerGas).toBeUndefined();
    expect(sent().maxPriorityFeePerGas).toBeUndefined();
  });

  it("still sends when the fee cannot be read", async () => {
    const { ledger, sent } = ledgerWithSigner(vi.fn().mockRejectedValue(new Error("RPC down")));
    await ledger.pause();
    expect(sent().maxFeePerGas).toBeUndefined();
  });
});

describe("ethersLedger: hasFeeFunds", () => {
  it("refuses an empty wallet, even when the node reports no fee price", async () => {
    expect(await ledgerWith({ balance: 0n }).hasFeeFunds(ACCOUNT)).toBe(false);
  });

  it("refuses a balance below the minimum gas at the current fee", async () => {
    expect(await ledgerWith({ balance: 999_999n, maxFeePerGas: 1n }).hasFeeFunds(ACCOUNT)).toBe(false);
  });

  it("accepts a balance that covers the minimum gas", async () => {
    expect(await ledgerWith({ balance: 1_000_000n, maxFeePerGas: 1n }).hasFeeFunds(ACCOUNT)).toBe(true);
  });

  it("falls back to the legacy gas price", async () => {
    expect(await ledgerWith({ balance: 999_999n, gasPrice: 1n }).hasFeeFunds(ACCOUNT)).toBe(false);
  });

  it("reports a failed read as a ledger error", async () => {
    const provider = { getBalance: vi.fn().mockRejectedValue({ code: "NETWORK_ERROR" }), getFeeData: vi.fn().mockResolvedValue({}) };
    const ledger = createEthersLedger({ provider, getSigner: async () => null, address: ADDRESS, abi });
    await expect(ledger.hasFeeFunds(ACCOUNT)).rejects.toMatchObject({ code: LEDGER_ERROR.NETWORK });
  });
});
