import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAddress, hexlify, toUtf8Bytes, verifyMessage } from "ethers";
import { authClient as defaultAuthClient } from "../auth/authClient.js";
import { buildSiweMessage } from "../auth/siweMessage.js";
import { sameAddress, shorten } from "../web3/format.js";
import { parseChainId, WalletContext } from "./walletContext.js";

/** How long a sign-in message stays signable. The server's session lasts longer (server/siweAuth.js). */
const SIGN_IN_WINDOW_MS = 5 * 60_000;
/** A session this close to expiry is renewed before an action rather than left to lapse half-way through it. */
const EXPIRY_MARGIN_MS = 30_000;

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

function describeSignInError(err) {
  if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
    return "Sign-in was cancelled. Evidence actions need a signed sign-in message (free, and not a transaction).";
  }
  return err?.message ? `Could not sign in: ${err.message}` : "Could not sign in. Please try again.";
}

/** MetaMask can say whether it is locked; other wallets cannot. Returns null when unknown. */
async function isWalletLocked(provider) {
  try {
    const unlocked = await provider?._metamask?.isUnlocked?.();
    return typeof unlocked === "boolean" ? !unlocked : null;
  } catch {
    return null;
  }
}

async function readSelectedAccount(provider) {
  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    return Array.isArray(accounts) && typeof accounts[0] === "string" && accounts[0] ? accounts[0] : null;
  } catch {
    return null;
  }
}

/**
 * Provides wallet state and the sign-in session, backed by an injected EIP-1193 wallet such as MetaMask. Read it
 * with `useWallet()` (see walletContext.js for the value's shape).
 *
 * Sign-in: connecting asks the wallet to sign an EIP-4361 message containing a single-use server nonce. The server
 * (server/siweAuth.js) checks the signature and sets an httpOnly session cookie. The session is bound to one
 * address: if the wallet locks, disconnects or switches account, the session is ended at once, and the next
 * evidence action (`ensureSession`) asks for a fresh signature.
 *
 * A session proves who is acting. It grants no permission: roles are on chain and the contract checks every write.
 *
 * @param {object} props
 * @param {typeof defaultAuthClient} [props.authClient] Override for tests. Must be a stable object.
 */
export function WalletProvider({ children, authClient = defaultAuthClient }) {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState(null);
  const [session, setSession] = useState(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [notice, setNotice] = useState(null);
  const connectingRef = useRef(false);
  // Mirrors of state for async code, which must act on the CURRENT account rather than the one it started with.
  const accountRef = useRef(null);
  const sessionRef = useRef(null);
  const signInRef = useRef(null); // { address, promise } while a sign-in is in progress

  const updateAccount = useCallback((value) => {
    accountRef.current = value;
    setAccount(value);
  }, []);

  const updateSession = useCallback((value) => {
    sessionRef.current = value;
    setSession(value);
  }, []);

  /** Forgets the session here and on the server. Never throws. */
  const endSession = useCallback(() => {
    const hadSession = sessionRef.current !== null;
    updateSession(null);
    if (hadSession) authClient.logout().catch(() => {});
  }, [authClient, updateSession]);

  const lookUpChain = useCallback((provider) => {
    Promise.resolve(provider.request({ method: "eth_chainId" }))
      .then((id) => setChainId(parseChainId(id)))
      .catch(() => setChainId(null));
  }, []);

  /**
   * Signs in as `address`: fetch a nonce, have the wallet sign the EIP-4361 message, let the server verify it.
   * Concurrent calls for the same address share one wallet prompt.
   *
   * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
   */
  const signInAs = useCallback(
    (address) => {
      if (signInRef.current && sameAddress(signInRef.current.address, address)) return signInRef.current.promise;

      const promise = (async () => {
        const provider = getEthereumProvider();
        setIsSigningIn(true);
        setError(null);
        try {
          if (!provider) return { ok: false, error: "No Ethereum wallet detected." };
          const checksummed = getAddress(address);
          const nonce = await authClient.getNonce();
          const signingChain = parseChainId(await provider.request({ method: "eth_chainId" }).catch(() => null)) ?? 1;
          const issuedAt = Date.now();
          const message = buildSiweMessage({
            domain: window.location.host,
            address: checksummed,
            uri: window.location.origin,
            chainId: signingChain,
            nonce,
            issuedAt: new Date(issuedAt).toISOString(),
            expirationTime: new Date(issuedAt + SIGN_IN_WINDOW_MS).toISOString(),
          });
          const signature = await provider.request({ method: "personal_sign", params: [hexlify(toUtf8Bytes(message)), checksummed] });
          // Checked here too so a wallet that signed with another account gets a clear message, not a server refusal.
          if (!sameAddress(verifyMessage(message, signature), checksummed)) {
            return { ok: false, error: "The wallet signed with a different account than the one connected. Select that account in your wallet and try again." };
          }
          const next = await authClient.verify(message, signature);
          // The wallet may have switched while the prompt was open. A session for an account we no longer show is dropped.
          if (!sameAddress(accountRef.current, next.address)) {
            authClient.logout().catch(() => {});
            return { ok: false, error: "Your wallet switched account during sign-in. Try again." };
          }
          updateSession(next);
          setNotice(null);
          return { ok: true };
        } catch (err) {
          const message = describeSignInError(err);
          setError(message);
          return { ok: false, error: message };
        } finally {
          setIsSigningIn(false);
          signInRef.current = null;
        }
      })();
      signInRef.current = { address, promise };
      return promise;
    },
    [authClient, updateSession]
  );

  /**
   * Applies the wallet's current account list (from an event, a focus check or a pre-action check). Any change
   * ends the session: a lock or disconnect also clears the account; a switch follows the new account, which then has
   * to sign in before it can act.
   */
  const applyAccounts = useCallback(
    (accounts) => {
      const previous = accountRef.current;
      if (!previous) return; // wallet events never connect by themselves
      const next = Array.isArray(accounts) && typeof accounts[0] === "string" && accounts[0] ? accounts[0] : null;
      if (next && sameAddress(next, previous)) return;

      endSession();
      if (next) {
        updateAccount(next);
        setNotice(`Your wallet switched to ${shorten(next)}. You will be asked to sign in as this account before any evidence action.`);
        return;
      }
      updateAccount(null);
      setChainId(null);
      setNotice("Your wallet disconnected from this site. Connect again to continue.");
      isWalletLocked(getEthereumProvider()).then((locked) => {
        if (locked) setNotice("Your wallet was locked. Unlock it and connect again to continue.");
      });
    },
    [endSession, updateAccount]
  );

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
    let connected = null;
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (Array.isArray(accounts) && typeof accounts[0] === "string" && accounts[0]) {
        connected = accounts[0];
        if (!sameAddress(sessionRef.current?.address, connected)) endSession();
        updateAccount(connected);
        setNotice(null);
        // The chain the wallet is on decides whether the contract can be reached at all. Looked up in the
        // background so a slow wallet does not hold the "connecting" state open.
        lookUpChain(provider);
      } else {
        setError("The wallet did not return any accounts. Unlock your wallet and try again.");
      }
    } catch (err) {
      setError(describeConnectError(err));
    } finally {
      connectingRef.current = false;
      setIsConnecting(false);
    }
    // Sign-in is part of connecting. If the user declines, they stay connected (read-only views work) and are asked
    // again before any evidence action.
    if (connected && !sameAddress(sessionRef.current?.address, connected)) await signInAs(connected);
  }, [endSession, lookUpChain, signInAs, updateAccount]);

  const disconnect = useCallback(() => {
    endSession();
    updateAccount(null);
    setChainId(null);
    setError(null);
    setNotice(null);
  }, [endSession, updateAccount]);

  /** Signs in as the connected account (the "Sign in" button). */
  const signIn = useCallback(async () => {
    const current = accountRef.current;
    if (!current) return { ok: false, error: "Connect your wallet first." };
    return signInAs(current);
  }, [signInAs]);

  /**
   * Call before every evidence action. Resolves `{ ok: true }` only when the account the page shows is still the one
   * selected in the wallet AND holds a live server session; otherwise it asks for a fresh signature, or refuses when
   * the account changed (the page then re-renders for the new account and the user decides again).
   *
   * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
   */
  const ensureSession = useCallback(async () => {
    const provider = getEthereumProvider();
    const shown = accountRef.current;
    if (!provider || !shown) return { ok: false, error: "Connect your wallet first." };

    // Ask the wallet directly: a lock or account switch may not have reached us as an event yet.
    const selected = await readSelectedAccount(provider);
    if (!selected) {
      applyAccounts([]);
      return { ok: false, error: "Your wallet is locked or disconnected. Unlock it and connect again." };
    }
    if (!sameAddress(selected, shown)) {
      applyAccounts([selected]);
      return { ok: false, error: `Your wallet switched to ${shorten(selected)}. Nothing was sent. Check the page, then try again as that account.` };
    }

    const local = sessionRef.current;
    if (local && sameAddress(local.address, shown) && local.expiresAt > Date.now() + EXPIRY_MARGIN_MS) {
      // The server is the authority (it may have restarted, or the cookie may have been cleared).
      const server = await authClient.getSession().catch(() => null);
      if (server && sameAddress(server.address, shown)) return { ok: true };
      updateSession(null);
    }
    return signInAs(shown);
  }, [applyAccounts, authClient, signInAs, updateSession]);

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
  const clearNotice = useCallback(() => setNotice(null), []);

  // On load, resume a session that is still valid on the server, but only if the wallet (asked silently, without a
  // prompt) still has that same account selected. A leftover session for any other account is ended.
  useEffect(() => {
    const provider = getEthereumProvider();
    if (!provider) return undefined;
    let cancelled = false;
    Promise.all([authClient.getSession().catch(() => null), readSelectedAccount(provider)]).then(([server, selected]) => {
      if (cancelled || !server || accountRef.current) return;
      if (selected && sameAddress(selected, server.address) && server.expiresAt > Date.now()) {
        updateAccount(selected);
        updateSession(server);
        lookUpChain(provider);
      } else {
        authClient.logout().catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authClient, lookUpChain, updateAccount, updateSession]);

  // While connected, follow what the wallet does: account switches, locks (an empty account list) and provider
  // disconnects. Returning to the tab re-reads the accounts, for wallets that do not emit events while hidden.
  const isConnected = account !== null;
  useEffect(() => {
    if (!isConnected) return undefined;
    const provider = getEthereumProvider();
    if (!provider || typeof provider.on !== "function") return undefined;

    const handleAccountsChanged = (accounts) => applyAccounts(accounts);
    const handleChainChanged = (nextChainId) => setChainId(parseChainId(nextChainId));
    const handleDisconnect = () => applyAccounts([]);
    const recheck = () => {
      if (document.visibilityState === "hidden") return;
      readSelectedAccount(provider).then((selected) => applyAccounts(selected ? [selected] : []));
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    provider.on("disconnect", handleDisconnect);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      const remove = typeof provider.removeListener === "function" ? "removeListener" : typeof provider.off === "function" ? "off" : null;
      if (remove) {
        provider[remove]("accountsChanged", handleAccountsChanged);
        provider[remove]("chainChanged", handleChainChanged);
        provider[remove]("disconnect", handleDisconnect);
      }
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [isConnected, applyAccounts]);

  // A session ends at its expiry time even if nothing else happens.
  useEffect(() => {
    if (!session) return undefined;
    const timer = setTimeout(() => {
      updateSession(null);
      setNotice("Your sign-in expired. You will be asked to sign again before the next evidence action.");
    }, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [session, updateSession]);

  const isSignedIn = session !== null && sameAddress(session.address, account);

  const value = useMemo(
    () => ({
      account,
      chainId,
      connect,
      disconnect,
      switchChain,
      error,
      isConnecting,
      clearError,
      session,
      isSignedIn,
      isSigningIn,
      signIn,
      ensureSession,
      notice,
      clearNotice,
    }),
    [account, chainId, connect, disconnect, switchChain, error, isConnecting, clearError, session, isSignedIn, isSigningIn, signIn, ensureSession, notice, clearNotice]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
