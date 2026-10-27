import { useMemo } from "react";
import { BrowserProvider } from "ethers";
import { useWallet } from "../context/walletContext.js";
import abi from "./EvidenceLocker.abi.json";
import { lockerConfig } from "./config.js";
import { createEthersLedger } from "./ethersLedger.js";
import { LedgerContext } from "./ledgerContext.js";

/**
 * Connects the app to the EvidenceLocker contract and exposes it with `useLedger()`.
 *
 * Order of decisions (fail closed):
 *  1. The configured address is not a valid address -> "misconfigured".
 *  2. No contract configured -> "unconfigured": no ledger, so nobody is authorised.
 *  3. A contract is configured -> the real chain, but only once a wallet is connected AND on the right network.
 *
 * @param {object} props
 * @param {object} [props.config] Override for tests.
 * @param {(account: string) => object} [props.createLedger] Tests only: builds the ledger adapter for the connected
 *        account instead of the ethers one (see src/test/ledgerHarness.jsx). Must keep the same identity across renders.
 */
export function LedgerProvider({ children, config = lockerConfig, createLedger }) {
  const { account, chainId } = useWallet();

  const value = useMemo(() => {
    if (config.invalidAddress) return { mode: "misconfigured", ledger: null, config };
    if (!config.configured) return { mode: "unconfigured", ledger: null, config };

    if (!account || (!createLedger && (typeof window === "undefined" || !window.ethereum))) return { mode: "no-wallet", ledger: null, config };
    if (chainId === null) return { mode: "checking-network", ledger: null, config };
    if (chainId !== config.chainId) return { mode: "wrong-network", ledger: null, config };

    if (createLedger) return { mode: "chain", ledger: createLedger(account), config };

    const provider = new BrowserProvider(window.ethereum, config.chainId);
    const ledger = createEthersLedger({
      provider,
      getSigner: () => provider.getSigner(account),
      address: config.address,
      abi,
      deployBlock: config.deployBlock,
    });
    return { mode: "chain", ledger, config };
  }, [account, chainId, config, createLedger]);

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}
