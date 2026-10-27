import { RoleContext } from "../context/roleContext.js";
import { can as roleCan, NO_ROLES, primaryRole, toRoleFlags } from "../web3/roles.js";

/**
 * Provides a role context with fixed values, for component tests that need a role but no ledger.
 *
 *   <RoleTestProvider roles={{ isInvestigator: true }}>…</RoleTestProvider>
 *   <RoleTestProvider status="loading">…</RoleTestProvider>
 *
 * Like the real provider it fails closed: `can()` is false unless the status is "ready".
 */
export function RoleTestProvider({ roles = { isInvestigator: true }, status = "ready", isDemo = false, children, ...overrides }) {
  const flags = status === "ready" ? toRoleFlags(roles) : NO_ROLES;
  const value = {
    status,
    mode: isDemo ? "demo" : "chain",
    roles: flags,
    role: primaryRole(flags),
    can: (capability) => status === "ready" && roleCan(flags, capability),
    error: null,
    refresh: async () => {},
    switchNetwork: async () => true,
    config: { address: null, chainId: 11155111, chainName: "Sepolia", explorerUrl: "", configured: false, deployBlock: 0, invalidAddress: false },
    isDemo,
    setPreviewRole: () => {},
    ...overrides,
  };
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
