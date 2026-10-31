import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { friendlyMessage } from "../web3/ledgerErrors.js";
import { useLedger } from "../web3/ledgerContext.js";
import { NO_ROLES, branchScope, can as roleCan, primaryRole, toRoleFlags } from "../web3/roles.js";
import { useWallet } from "./walletContext.js";
import { RoleContext } from "./roleContext.js";

/** Statuses that come straight from how the ledger is (not) connected. */
const STATUS_FOR_MODE = {
  "no-wallet": "disconnected",
  "checking-network": "loading",
  "wrong-network": "wrong-network",
  unconfigured: "unconfigured",
  misconfigured: "misconfigured",
};

/**
 * Reads the connected wallet's roles from the ledger (the contract's `rolesOf`) and keeps them current.
 *
 * Fail-closed rules:
 *  - `can()` is false in every status except "ready".
 *  - Roles belonging to a previous account or ledger are never reused: a result is only trusted while it matches
 *    the current account and ledger, otherwise the status is "loading".
 *  - An error while reading roles denies everything.
 */
export function RoleProvider({ children }) {
  const { account, switchChain } = useWallet();
  const { ledger, mode, config } = useLedger();

  const [result, setResult] = useState({ ledger: null, account: null, roles: NO_ROLES, branchId: null, error: null });
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!ledger || !account) return;
    const requestId = ++requestRef.current;
    try {
      const [flags, identity] = await Promise.all([ledger.getRoles(account), ledger.getIdentity?.(account)]);
      const roles = toRoleFlags(flags);
      const { branchId } = branchScope(roles, identity);
      if (requestId === requestRef.current) setResult({ ledger, account, roles, branchId, error: null });
    } catch (err) {
      if (requestId === requestRef.current) setResult({ ledger, account, roles: NO_ROLES, branchId: null, error: friendlyMessage(err) });
    }
  }, [ledger, account]);

  // Load on mount and whenever the account or ledger changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change; the state is set after the await
    void refresh();
    return () => {
      requestRef.current += 1; // anything still in flight belongs to a stale account/ledger
    };
  }, [refresh]);

  // Stay current when roles change on chain (for example the Chief grants this wallet a role).
  useEffect(() => ledger?.subscribe?.(() => void refresh()), [ledger, refresh]);

  const fresh = result.ledger === ledger && result.account === account;
  const status = STATUS_FOR_MODE[mode] ?? (!fresh ? "loading" : result.error ? "error" : "ready");

  const roles = status === "ready" ? result.roles : NO_ROLES;
  const branchId = status === "ready" ? result.branchId : null;
  const can = useCallback((capability) => status === "ready" && roleCan(roles, capability), [status, roles]);

  const switchNetwork = useCallback(() => switchChain(config.chainId), [switchChain, config.chainId]);

  const value = useMemo(
    () => ({
      status,
      mode,
      roles,
      role: primaryRole(roles),
      branchId,
      can,
      error: status === "error" ? result.error : null,
      refresh,
      switchNetwork,
      config,
      isDemo: mode === "demo",
    }),
    [status, mode, roles, branchId, can, result.error, refresh, switchNetwork, config]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
