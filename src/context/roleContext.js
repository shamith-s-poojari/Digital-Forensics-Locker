import { createContext, useContext } from "react";

/**
 * Value provided by <RoleProvider> (src/context/RoleContext.jsx).
 *
 *   status   "loading" | "ready" | "disconnected" | "wrong-network" | "unconfigured" | "misconfigured" | "error"
 *   mode     "chain" | "demo" | ... (see ledgerContext.js)
 *   roles    { isAdmin, isInvestigator, isAuditor }; all false unless status is "ready"
 *   role     the single most privileged role, for badges ("none" | "auditor" | "investigator" | "admin")
 *   can(cap) true only when status is "ready" AND the role grants the capability (fails closed)
 *   error    message when status is "error"
 *   refresh  re-reads the roles from the ledger
 *   switchNetwork  asks the wallet to move to the contract's network
 *   isDemo   true when running on the in-memory demo ledger (development and tests only)
 *
 * This is for what the UI SHOWS. The contract and the API enforce access; see roles.js.
 */
export const RoleContext = createContext(null);

export function useRole() {
  const value = useContext(RoleContext);
  if (value === null) throw new Error("useRole must be used within a <RoleProvider>.");
  return value;
}
