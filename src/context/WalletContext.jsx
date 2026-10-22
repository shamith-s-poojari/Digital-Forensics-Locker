import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WalletContext } from "./walletContext.js";

/** Returns the injected EIP-1193 provider (e.g. MetaMask), or null if there is none. */
function getEthereumProvider() {
  if (typeof window === "undefined") return null;
  const provider = window.ethereum;
  return provider && typeof provider.request === "function" ? provider : null;
}

/** Maps a failed `eth_requestAccounts` call to a message that is safe to show the user. */
function describeConnectError(err) {
  if (err?.code === 4001) {
    return "Connection request was rejected. Approve the request in your wallet to continue.";
  }
  if (err?.code === -32002) {
    return "A connection request is already pending. Open your wallet to respond to it.";
  }
  return err?.message ? `Could not connect wallet: ${err.message}` : "Could not connect wallet. Please try again.";
}

/**
 * Provides wallet state (`account`, `connect`, `disconnect`, `error`, `isConnecting`, `clearError`)
 * backed by an injected EIP-1193 wallet such as MetaMask. Read it with `useWallet()`.
 *
 * Note: this only identifies which account the user controls. It does not authenticate
 * anyone or authorize any action; there is no signature check and no server.
 */
export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;

    const provider = getEthereumProvider();
    if (!provider) {
      setError("No Ethereum wallet detected. Install MetaMask (or another browser wallet) and try again.");
      return;
    }

    connectingRef.current = true;
    setError(null);
    setIsConnecting(true);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (Array.isArray(accounts) && typeof accounts[0] === "string" && accounts[0]) {
        setAccount(accounts[0]);
      } else {
        setError("The wallet did not return any accounts. Unlock your wallet and try again.");
      }
    } catch (err) {
      setError(describeConnectError(err));
    } finally {
      connectingRef.current = false;
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // While connected, follow account switches made inside the wallet. An empty list means the
  // wallet was locked or the site was disconnected, so the local session is cleared.
  const isConnected = account !== null;
  useEffect(() => {
    if (!isConnected) return undefined;
    const provider = getEthereumProvider();
    if (!provider || typeof provider.on !== "function") return undefined;

    const handleAccountsChanged = (accounts) => {
      if (!Array.isArray(accounts) || accounts.length === 0) {
        setAccount(null);
      } else {
        setAccount(accounts[0]);
      }
    };

    provider.on("accountsChanged", handleAccountsChanged);
    return () => {
      if (typeof provider.removeListener === "function") {
        provider.removeListener("accountsChanged", handleAccountsChanged);
      } else if (typeof provider.off === "function") {
        provider.off("accountsChanged", handleAccountsChanged);
      }
    };
  }, [isConnected]);

  const value = useMemo(
    () => ({ account, connect, disconnect, error, isConnecting, clearError }),
    [account, connect, disconnect, error, isConnecting, clearError]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
