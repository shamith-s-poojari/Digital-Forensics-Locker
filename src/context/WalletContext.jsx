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
    return "A connection request is already open in your wallet. Click the MetaMask icon in the browser toolbar to approve it; this page continues by itself.";
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
  return (await readPermittedAccounts(provider))[0] ?? null;
}

/**
 * Every account the wallet lets this site use (`eth_accounts`), its active account first. Empty when the wallet is
 * locked or the site is not connected.
 */
async function readPermittedAccounts(provider) {
  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    return toAccountList(accounts);
  } catch {
    return [];
  }
}

/** Withdraws this site's access to every wallet account (MetaMask). Resolves false when the wallet cannot. */
async function revokeSiteAccess(provider) {
  try {
    await provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    return true;
  } catch {
    return false;
  }
}

const toAccountList = (accounts) => (Array.isArray(accounts) ? accounts.filter((a) => typeof a === "string" && a) : []);

/** How long to wait for the user to answer a connection request the wallet already has open (error -32002). */
const PENDING_REQUEST_WAIT_MS = 120_000;
const PENDING_REQUEST_POLL_MS = 1_000;

/**
 * Waits for the wallet to grant this site an account, which is what approving an already-open connection request
 * does. MetaMask does not reopen its popup for a second request, so the earlier one is the only way in. Listens for
 * `accountsChanged` and also polls `eth_accounts`, for wallets that do not emit the event.
 *
 * @returns {Promise<string | null>} the approved account, or null if nothing was approved within `timeoutMs`
 */
function waitForApprovedAccount(provider, timeoutMs = PENDING_REQUEST_WAIT_MS) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (account) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(deadline);
      provider.removeListener?.("accountsChanged", onAccounts);
      resolve(account);
    };
    const onAccounts = (accounts) => {
      if (Array.isArray(accounts) && typeof accounts[0] === "string" && accounts[0]) finish(accounts[0]);
    };
    provider.on?.("accountsChanged", onAccounts);
    const poll = setInterval(() => void readSelectedAccount(provider).then((account) => account && finish(account)), PENDING_REQUEST_POLL_MS);
    const deadline = setTimeout(() => finish(null), timeoutMs);
  });
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
  /** Every account the wallet lets this site use. */
  const [permittedAccounts, setPermittedAccounts] = useState([]);
  /** Set when the wallet's picker approved several accounts: the user picks one in the page (`chooseAccount`). */
  const [accountChoices, setAccountChoices] = useState(null);
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

  /** Signs out and forgets the connected account here. The wallet's own permissions are untouched. */
  const disconnectLocally = useCallback(() => {
    endSession();
    updateAccount(null);
    setPermittedAccounts([]);
    setAccountChoices(null);
    setChainId(null);
    setError(null);
    setNotice(null);
  }, [endSession, updateAccount]);

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
   * Applies the wallet's current account list (from an event, a focus check or a pre-action check). The page stays
   * on the account in use for as long as the wallet still lets this site use it: the order MetaMask lists accounts in
   * changes on its own (for example right after its picker closes), so it is never read as a switch. Roles are
   * switched only with `switchAccount`. If the account in use is no longer shared, or the wallet locks or disconnects,
   * the user is signed out and must connect again.
   */
  const applyAccounts = useCallback(
    (accounts) => {
      const list = toAccountList(accounts);
      setPermittedAccounts(list);
      if (list.length === 0) setAccountChoices(null);

      const previous = accountRef.current;
      if (!previous) return; // wallet events never connect by themselves
      if (list.some((a) => sameAddress(a, previous))) return;

      if (list.length > 0) {
        disconnectLocally();
        setNotice(`${shorten(previous)} is no longer connected to this site, so you were signed out. Connect again to continue.`);
        return;
      }
      endSession();
      updateAccount(null);
      setChainId(null);
      setNotice("Your wallet disconnected from this site. Connect again to continue.");
      isWalletLocked(getEthereumProvider()).then((locked) => {
        if (locked) setNotice("Your wallet was locked. Unlock it and connect again to continue.");
      });
    },
    [disconnectLocally, endSession, updateAccount]
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
      let accounts;
      try {
        accounts = await provider.request({ method: "eth_requestAccounts" });
      } catch (err) {
        // The wallet already has a request open (an earlier click whose popup was closed or hidden). Say where to
        // answer it and carry on once it is approved, instead of making the user find it and click Connect again.
        if (err?.code !== -32002) throw err;
        setError(describeConnectError(err));
        const approved = await waitForApprovedAccount(provider);
        if (!approved) throw err;
        setError(null);
        accounts = [approved];
      }
      const approved = toAccountList(accounts);
      if (approved.length > 1 && !accountRef.current) {
        // Several accounts were ticked in the wallet's picker. Which one comes first is the wallet's choice, not the
        // user's, so ask in the page rather than guess (see `chooseAccount`).
        setPermittedAccounts(approved);
        setAccountChoices(approved);
        setNotice("You connected several accounts. Choose which one to sign in as.");
        lookUpChain(provider);
      } else if (approved.length > 0) {
        connected = approved[0];
        setPermittedAccounts(approved);
        setAccountChoices(null);
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

  /** Picks which of the accounts approved together in the wallet's picker to use, and signs in as it. */
  const chooseAccount = useCallback(
    async (address) => {
      const provider = getEthereumProvider();
      if (!provider || !address) return;
      const shared = await readPermittedAccounts(provider);
      setPermittedAccounts(shared);
      if (!shared.some((a) => sameAddress(a, address))) {
        setAccountChoices(shared.length > 1 ? shared : null);
        setError(`${shorten(address)} is not connected to this site any more. Use Connect to pick it again.`);
        return;
      }
      setAccountChoices(null);
      endSession();
      updateAccount(address);
      setError(null);
      setNotice(null);
      lookUpChain(provider);
      await signInAs(address);
    },
    [endSession, lookUpChain, signInAs, updateAccount]
  );

  /**
   * Switches role. A website cannot lock the wallet, so this does the strongest thing a page can: end the session,
   * withdraw this site's access to EVERY account in the wallet (`wallet_revokePermissions`), then connect from
   * scratch, so the next role must be picked in the wallet's own account picker and sign in again. If the wallet
   * cannot withdraw access, the page stays disconnected rather than silently reusing an account.
   */
  const switchAccount = useCallback(async () => {
    if (connectingRef.current) return;
    const provider = getEthereumProvider();
    if (!provider) {
      setError("No Ethereum wallet detected. Install MetaMask (or another browser wallet) and try again.");
      return;
    }

    connectingRef.current = true;
    setIsConnecting(true);
    // Clear the account first: revoking fires `accountsChanged([])`, which must find nothing left to follow.
    disconnectLocally();
    const revoked = await revokeSiteAccess(provider);
    connectingRef.current = false;
    setIsConnecting(false);
    if (!revoked) {
      setNotice("Signed out. Your wallet could not disconnect this site by itself: remove the site in your wallet's connected sites, then connect again as the next role.");
      return;
    }
    setNotice("In MetaMask's window, tick only the account you want to use, then Connect.");
    await connect();
  }, [connect, disconnectLocally]);

  const disconnect = useCallback(() => {
    // Also withdraw this site's account permission (MetaMask supports this; other wallets may not), so the next
    // connect shows the wallet's account picker again instead of silently reusing the account.
    const provider = getEthereumProvider();
    disconnectLocally();
    if (provider) void revokeSiteAccess(provider);
  }, [disconnectLocally]);

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
    const shared = await readPermittedAccounts(provider);
    if (shared.length === 0) {
      applyAccounts([]);
      return { ok: false, error: "Your wallet is locked or disconnected. Unlock it and connect again." };
    }
    applyAccounts(shared);
    if (!sameAddress(accountRef.current, shown)) {
      return { ok: false, error: "This account is no longer connected to the site, so you were signed out. Nothing was sent. Connect again to continue." };
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

  // Every page load starts signed out: a session left on the server by a previous load (a refresh, or a browser that
  // was closed) is ended, never resumed, so the user connects, signs and has their role read again.
  useEffect(() => {
    let cancelled = false;
    authClient
      .getSession()
      .catch(() => null)
      .then((server) => {
        if (!cancelled && server && !sessionRef.current) authClient.logout().catch(() => {});
      });
    return () => {
      cancelled = true;
    };
  }, [authClient]);

  // Leaving the page (refresh, close, navigating away) ends the session at once. `keepalive` lets the request outlive
  // the page. Clearing local state as well means a page restored from the back/forward cache is signed out too.
  useEffect(() => {
    const onPageHide = () => {
      if (sessionRef.current) authClient.logout({ keepalive: true }).catch(() => {});
      updateSession(null);
      updateAccount(null);
      setChainId(null);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [authClient, updateAccount, updateSession]);

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
      readPermittedAccounts(provider).then(applyAccounts);
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
      switchAccount,
      permittedAccounts,
      accountChoices,
      chooseAccount,
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
    [account, chainId, connect, switchAccount, permittedAccounts, accountChoices, chooseAccount, disconnect, switchChain, error, isConnecting, clearError, session, isSignedIn, isSigningIn, signIn, ensureSession, notice, clearNotice]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
