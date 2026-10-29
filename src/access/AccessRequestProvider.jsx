import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "../context/walletContext.js";
import { useLedger } from "../web3/ledgerContext.js";
import { branchScope } from "../web3/roles.js";
import { AccessRequestContext, UNAVAILABLE_REQUESTS } from "./accessRequestContext.js";
import { createDemoAccessRequestStore, httpAccessRequestStore } from "./accessRequestStores.js";

/** The acting wallet's branch scope, read from the ledger. Only the demo store needs it; the server works it out. */
async function readScope(ledger, account) {
  const [flags, identity] = await Promise.all([ledger.getRoles(account), ledger.getIdentity?.(account)]);
  return branchScope(flags, identity);
}

/**
 * Provides access requests (see accessRequestContext.js) from the store that matches the ledger: the server store
 * with a real contract, an in-memory store with the demo ledger (shared by every account used in this page, so one
 * MetaMask account can request and another, the Chief, can approve), none otherwise.
 *
 * @param {object} props
 * @param {object} [props.store] Override for tests (any object with the interface in accessRequestStores.js).
 */
export function AccessRequestProvider({ children, store: override }) {
  const { mode, ledger } = useLedger();
  const { account, isSignedIn, ensureSession } = useWallet();
  const [demoStore] = useState(() => createDemoAccessRequestStore());
  const store = override ?? (mode === "demo" ? demoStore : mode === "chain" ? httpAccessRequestStore : null);
  const needsSignIn = store?.kind === "server";
  // Re-read when the account changes, and (server) once a sign-in makes the store readable.
  const key = store && account ? `${store.kind}:${account}:${needsSignIn ? isSignedIn : ""}` : null;

  const [state, setState] = useState({ status: "loading", mine: null, pending: [], error: null, key: null });

  const read = useCallback(
    () =>
      (store.kind === "demo" && ledger ? readScope(ledger, account) : Promise.resolve(undefined))
        .then((scope) => Promise.all([store.mine(account), store.list(scope)]))
        .then(
          ([mine, pending]) => ({ status: "ready", mine, pending, error: null, key }),
          (err) => ({ status: err?.status === 401 ? "signed-out" : "error", mine: null, pending: [], error: err?.message ?? "Could not read access requests.", key })
        ),
    [store, ledger, account, key]
  );

  const reload = useCallback(async () => {
    if (store && account) setState(await read());
  }, [store, account, read]);

  useEffect(() => {
    if (!store || !account) return undefined;
    let cancelled = false;
    read().then((next) => !cancelled && setState(next));
    return () => {
      cancelled = true;
    };
  }, [store, account, read]);

  const write = useCallback(
    async (fn) => {
      // The server only accepts signed-in callers; the session is what proves who is asking.
      if (needsSignIn) {
        const auth = await ensureSession();
        if (!auth.ok) throw new Error(auth.error);
      }
      const result = await fn();
      await reload();
      return result;
    },
    [needsSignIn, ensureSession, reload]
  );

  const value = useMemo(() => {
    if (!store) return UNAVAILABLE_REQUESTS;
    const fresh = state.key === key;
    return {
      status: fresh ? state.status : "loading",
      mine: fresh ? state.mine : null,
      pending: fresh ? state.pending : [],
      error: fresh ? state.error : null,
      reload,
      submit: (fields) => write(() => store.submit(fields, account)),
      resolve: (id, status) => write(() => store.resolve(id, status, account)),
    };
  }, [store, state, key, reload, write, account]);

  return <AccessRequestContext.Provider value={value}>{children}</AccessRequestContext.Provider>;
}
