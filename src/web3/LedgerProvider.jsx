import { useMemo, useState } from "react";
import { BrowserProvider } from "ethers";
import { useWallet } from "../context/walletContext.js";
import abi from "./EvidenceLocker.abi.json";
import { isDemoAllowed, lockerConfig } from "./config.js";
import { createDemoLedger, createDemoStore } from "./demoLedger.js";
import { createEthersLedger } from "./ethersLedger.js";
import { LedgerContext } from "./ledgerContext.js";

/**
 * Chooses how the app talks to the ledger and exposes it with `useLedger()`.
 *
 * Order of decisions (fail closed):
 *  1. A contract address is configured -> real chain, but only once a wallet is connected AND on the right network.
 *  2. No address, development/test build -> in-memory demo ledger.
 *  3. No address, production build -> "unconfigured": no ledger, so nobody is authorised.
 *
 * @param {object} props
 * @param {object} [props.config]       Override for tests.
 * @param {boolean} [props.demoAllowed] Override for tests.
 * @param {object} [props.demoStore]    Shared demo store (tests).
 * @param {{ signDelayMs?: number, confirmDelayMs?: number }} [props.demoDelays] Must be a stable object (a new one each
 *        render would create a new ledger each render).
 */
export function LedgerProvider({ children, config = lockerConfig, demoAllowed = isDemoAllowed(), demoStore, demoDelays }) {
  const { account, chainId } = useWallet();
  // One demo chain for the lifetime of the provider (created lazily, and only when the demo ledger will be used).
  const [store] = useState(() => (demoAllowed && !config.configured && !config.invalidAddress ? (demoStore ?? createDemoStore()) : null));

  const value = useMemo(() => {
    if (config.invalidAddress) return { mode: "misconfigured", ledger: null, config };

    if (config.configured) {
      if (!account || typeof window === "undefined" || !window.ethereum) return { mode: "no-wallet", ledger: null, config };
      if (chainId === null) return { mode: "checking-network", ledger: null, config };
      if (chainId !== config.chainId) return { mode: "wrong-network", ledger: null, config };

      const provider = new BrowserProvider(window.ethereum, config.chainId);
      const ledger = createEthersLedger({
        provider,
        getSigner: () => provider.getSigner(account),
        address: config.address,
        abi,
        deployBlock: config.deployBlock,
      });
      return { mode: "chain", ledger, config };
    }

    if (demoAllowed) {
      // A connected dev wallet starts as an Investigator so the full UI can be explored; the role previewer changes it.
      const ledger = createDemoLedger({ store, account, defaultRole: "investigator", ...demoDelays });
      return { mode: "demo", ledger, config };
    }

    return { mode: "unconfigured", ledger: null, config };
  }, [account, chainId, config, demoAllowed, demoDelays, store]);

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}
