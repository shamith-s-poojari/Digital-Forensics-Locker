import { useMemo } from "react";
import { ROLE_LABELS, ROLES } from "../web3/roles.js";
import { AuthContext } from "./authContext.js";
import { useRole } from "./roleContext.js";
import { useWallet } from "./walletContext.js";

/**
 * Turns "is a wallet connected" (WalletProvider) and "what does the contract say this wallet may do" (RoleProvider)
 * into a single gate for the app shell. It holds no state of its own, so it can never disagree with either of them:
 * switching account, locking the wallet or disconnecting re-runs the role check, and a refresh starts at
 * "signed-out" because the wallet provider never resumes a session.
 *
 * Must be inside both <WalletProvider> and <RoleProvider>.
 */
export function AuthProvider({ children }) {
  const { account, connect, switchAccount, disconnect, isConnecting, error, notice } = useWallet();
  const { status, role, isDemo } = useRole();

  const gate = !account
    ? "signed-out"
    : status === "loading"
      ? "verifying"
      : status !== "ready"
        ? "unavailable"
        : role === ROLES.NONE
          ? "denied"
          : "granted";
  const grantedRole = gate === "granted" ? role : ROLES.NONE;

  const value = useMemo(
    () => ({
      gate,
      account,
      role: grantedRole,
      roleLabel: ROLE_LABELS[grantedRole],
      connect,
      switchAccount,
      disconnect,
      isConnecting,
      error,
      notice,
      isDemo,
    }),
    [gate, account, grantedRole, connect, switchAccount, disconnect, isConnecting, error, notice, isDemo]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
