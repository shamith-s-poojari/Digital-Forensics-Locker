import { createContext, useContext } from "react";

/**
 * Value provided by <LedgerProvider> (src/web3/LedgerProvider.jsx).
 *
 *   mode: how the app is connected to the ledger
 *     "chain"             the EvidenceLocker contract on the configured network
 *     "no-wallet"         contract configured, no wallet connected yet
 *     "checking-network"  wallet connected, its network not known yet
 *     "wrong-network"     wallet is on a different network than the contract
 *     "unconfigured"      no contract configured (fails closed)
 *     "misconfigured"     VITE_LOCKER_ADDRESS is set but is not a valid address
 *   ledger: the ledger adapter, or null unless mode is "chain"
 *   config: the on-chain configuration (address, chain id, explorer)
 */
export const LedgerContext = createContext(null);

/** @returns {{ mode: string, ledger: object | null, config: ReturnType<typeof import("./config.js").readLockerConfig> }} */
export function useLedger() {
  const value = useContext(LedgerContext);
  if (value === null) throw new Error("useLedger must be used within a <LedgerProvider>.");
  return value;
}
