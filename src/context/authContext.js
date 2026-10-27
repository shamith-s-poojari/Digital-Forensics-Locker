import { createContext, useContext } from "react";

/**
 * Value provided by <AuthProvider> (src/context/AuthContext.jsx): the one gate the app shell checks before showing
 * anything behind it.
 *
 *   gate        "signed-out" | "verifying" | "denied" | "granted" | "unavailable"
 *                 signed-out   no wallet connected (every page load starts here)
 *                 verifying    connected; the role is being read from the contract
 *                 denied       the contract says this address holds no role
 *                 granted      the address holds at least one role
 *                 unavailable  the role cannot be read (wrong network, no contract configured, read error)
 *   account     connected address, or null
 *   role        "none" | "auditor" | "investigator" | "admin" | "chief" (see roles.js); "none" unless the gate is "granted"
 *   roleLabel   human label for `role`, for the header badge
 *   connect / disconnect / isConnecting / error / notice   passed through from the wallet
 *   isDemo      true on the in-memory demo ledger, where roles come from VITE_DEMO_* in .env
 *
 * Like everything in the UI this decides what is SHOWN. The contract rejects every unauthorised write.
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("useAuth must be used within an <AuthProvider>.");
  return value;
}
