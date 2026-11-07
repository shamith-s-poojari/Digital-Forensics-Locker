import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "../context/walletContext.js";
import { useLedger } from "../web3/ledgerContext.js";
import { computeCaseDigest } from "./caseDigest.js";
import { CaseDirectoryContext, UNAVAILABLE_DIRECTORY } from "./caseDirectoryContext.js";
import { createDemoCaseStore, httpCaseStore } from "./caseStores.js";

/**
 * Provides the case directory (see caseDirectoryContext.js), read from the case store that matches the ledger: the
 * server store with a real contract, the in-memory sample store with the demo ledger, none otherwise.
 *
 * @param {object} props
 * @param {object} [props.store] Override for tests (any object with the case-store interface in caseStores.js).
 */
export function CaseDirectoryProvider({ children, store: override }) {
  const { mode } = useLedger();
  const { account, isSignedIn, ensureSession } = useWallet();
  const [demoStore] = useState(() => createDemoCaseStore());
  const store = override ?? (mode === "demo" ? demoStore : mode === "chain" ? httpCaseStore : null);
  const needsSignIn = store?.kind === "server";
  // Re-read when the account changes, and (server) when a sign-in or sign-out changes what the store will return.
  const key = store && account ? `${store.kind}:${account}:${needsSignIn ? isSignedIn : ""}` : null;

  const [state, setState] = useState({ status: "loading", cases: [], error: null, key: null });

  /** Reads the store; resolves to the next state (callers apply it), so it can run from an effect or an event. */
  const read = useCallback(
    () =>
      store.list().then(
        (cases) => ({ status: "ready", cases, error: null, key }),
        (err) => ({ status: err?.status === 401 ? "signed-out" : "error", cases: [], error: err?.message ?? "Could not read the case store.", key })
      ),
    [store, key]
  );

  // A caller of reload may hold a render from before its own sign-in, so it reads through these and drops a result the
  // key has since moved past. Stored under an old key, that result would leave the directory "loading" for good.
  const latest = useRef({ key, read });
  useEffect(() => {
    latest.current = { key, read };
  }, [key, read]);

  const reload = useCallback(async () => {
    if (!store || !account) return;
    const next = await latest.current.read();
    if (next.key === latest.current.key) setState(next);
  }, [store, account]);

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
      // The server store only accepts signed-in callers, and a switched or locked wallet must not edit under the old identity.
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
    if (!store) return UNAVAILABLE_DIRECTORY;
    const fresh = state.key === key;
    const cases = fresh ? state.cases : [];
    const byRef = new Map(cases.map((c) => [c.caseRef, c]));
    return {
      status: fresh ? state.status : "loading",
      cases,
      byRef,
      error: fresh ? state.error : null,
      reload,
      // The acting account is passed along for the demo store; the server takes it from the session instead.
      create: (fields) => write(() => store.create(fields, account)),
      addVersion: (caseRef, fields) => write(() => store.addVersion(caseRef, fields, account)),
      currentDigest: (caseRef) => {
        const entry = byRef.get(caseRef);
        const v = entry?.versions.at(-1);
        return v ? computeCaseDigest({ caseRef: entry.caseRef, caseNumber: entry.caseNumber, title: v.title, description: v.description, salt: v.salt }) : null;
      },
    };
  }, [store, state, key, reload, write, account]);

  return <CaseDirectoryContext.Provider value={value}>{children}</CaseDirectoryContext.Provider>;
}
