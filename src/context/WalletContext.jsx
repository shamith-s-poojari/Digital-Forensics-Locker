import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseChainId, WalletContext } from "./walletContext.js";

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
  const [chainId, setChainId] = useState(null);
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
        // The chain the wallet is on decides whether the contract can be reached at all. Looked up in the
        // background so a slow wallet does not hold the "connecting" state open.
        Promise.resolve(provider.request({ method: "eth_chainId" }))
          .then((id) => setChainId(parseChainId(id)))
          .catch(() => setChainId(null));
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
    setChainId(null);
    setError(null);
  }, []);

  /** Asks the wallet to switch networks. Returns true on success; sets `error` otherwise. */
  const switchChain = useCallback(async (targetChainId) => {
    const provider = getEthereumProvider();
    if (!provider) {
      setError("No Ethereum wallet detected.");
      return false;
    }
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${targetChainId.toString(16)}` }] });
      setError(null);
      return true;
    } catch (err) {
      if (err?.code === 4001) setError("Network switch was rejected. Approve it in your wallet to continue.");
      else if (err?.code === 4902) setError("That network is not in your wallet yet. Add it in your wallet's network settings, then try again.");
      else setError("Could not switch network. Switch manually in your wallet.");
      return false;
    }
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
    const handleChainChanged = (nextChainId) => setChainId(parseChainId(nextChainId));

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    return () => {
      const remove = typeof provider.removeListener === "function" ? "removeListener" : typeof provider.off === "function" ? "off" : null;
      if (remove) {
        provider[remove]("accountsChanged", handleAccountsChanged);
        provider[remove]("chainChanged", handleChainChanged);
      }
    };
  }, [isConnected]);

  const value = useMemo(
    () => ({ account, chainId, connect, disconnect, switchChain, error, isConnecting, clearError }),
    [account, chainId, connect, disconnect, switchChain, error, isConnecting, clearError]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
