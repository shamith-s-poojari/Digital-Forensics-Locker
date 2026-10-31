// Server-side role checks: the API reads the signed-in wallet's roles from the EvidenceLocker contract (`rolesOf`),
// the same source the UI reads, and refuses what that role may not do. Capabilities and the role that grants each
// come from src/web3/roles.js, so the server and the UI can never disagree about who may do what.
//
// A sign-in session (server/siweAuth.js) proves who is calling; this module decides what they may do, and in which
// branch (the contract's `identityOf`): see `scope`.
//
// Fail-closed rules:
//  - A contract is configured but the server cannot read it (no RPC_URL, RPC down): every check is refused.
//  - No contract is configured: refused, except on the local dev server with the in-memory demo ledger
//    (`allowWithoutContract`), whose roles live in the browser and cannot be checked here.
//  - Roles are cached for ROLE_CACHE_MS per address to spare the RPC. A role revoked on chain therefore still
//    works on the server for up to that long; the contract itself rejects any write at once.

import { Contract, JsonRpcProvider } from "ethers";
import { branchScope, can, rolesGranting, toRoleFlags } from "../src/web3/roles.js";

const ROLES_ABI = [
  "function rolesOf(address account) view returns (bool isChief, bool isBranchAdmin, bool isInvestigator, bool isAuditor)",
  "function identityOf(address account) view returns ((bytes32 role, uint64 branchId))",
];
export const ROLE_CACHE_MS = 15_000;

/** Every branch, for the dev server with no contract (whose roles live in the browser) and for tests. */
const GLOBAL_SCOPE = Object.freeze({ global: true, branchId: null });

/**
 * Reads roles and the branch from a deployed contract over JSON-RPC.
 *
 * @param {{ rpcUrl: string, address: string, chainId?: number }} options
 * @returns {(account: string) => Promise<{ isChief: boolean, isAdmin: boolean, isInvestigator: boolean, isAuditor: boolean, branchId: number }>}
 */
export function createChainRoleReader({ rpcUrl, address, chainId }) {
  const provider = chainId ? new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true }) : new JsonRpcProvider(rpcUrl);
  const locker = new Contract(address, ROLES_ABI, provider);
  return async (account) => {
    const [[isChief, isAdmin, isInvestigator, isAuditor], identity] = await Promise.all([locker.rolesOf(account), locker.identityOf(account)]);
    return { ...toRoleFlags({ isChief, isAdmin, isInvestigator, isAuditor }), branchId: Number(identity.branchId) };
  };
}

/**
 * @param {object} options
 * @param {((account: string) => Promise<object>) | null} options.readRoles  null when no contract is configured
 * @param {string | null} [options.misconfigured]  set when a contract is configured but cannot be read; refuses everything
 * @param {boolean} [options.allowWithoutContract]  local dev server on the demo ledger: no checks (today's behaviour)
 * @param {() => number} [options.now]
 */
export function createRoleGate({ readRoles, misconfigured = null, allowWithoutContract = false, now = Date.now }) {
  /** @type {Map<string, { at: number, roles: Promise<object> }>} lowercase address -> cached read */
  const cache = new Map();

  function rolesFor(address) {
    const key = address.toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < ROLE_CACHE_MS) return hit.roles;
    const roles = readRoles(address);
    cache.set(key, { at: now(), roles });
    roles.catch(() => cache.delete(key)); // a failed read is never cached
    return roles;
  }

  /**
   * @param {{ address: string } | null} session  from server/siweAuth.js
   * @param {string} capability  one of CAPABILITIES in src/web3/roles.js
   * @returns {Promise<null | { status: number, error: string }>} null when allowed
   */
  async function check(session, capability) {
    if (!session) return { status: 401, error: "Sign in with your wallet first." };
    if (misconfigured) return { status: 503, error: misconfigured };
    if (!readRoles) {
      return allowWithoutContract ? null : { status: 503, error: "No evidence contract is configured on this server, so no wallet has a role." };
    }
    let roles;
    try {
      roles = await rolesFor(session.address);
    } catch {
      return { status: 503, error: "Could not read your role from the evidence contract. Try again shortly." };
    }
    if (can(roles, capability)) return null;
    return { status: 403, error: `Your wallet's role does not allow this. Required: ${rolesGranting(capability).join(" or ")}.` };
  }

  /**
   * Which branches the caller may see (roles.js `branchScope`). Call it after `check` has allowed the request; it
   * reuses the cached read. Without a contract (dev server, demo ledger) every branch.
   *
   * @param {{ address: string }} session
   * @returns {Promise<{ global: boolean, branchId: number | null }>}
   */
  async function scope(session) {
    if (!readRoles) return GLOBAL_SCOPE;
    const roles = await rolesFor(session.address);
    return branchScope(roles, roles);
  }

  return { check, scope };
}

/** No checks. The default for every store, so tests and the demo ledger behave as before. */
export const allowAll = async () => null;

/** No branch scoping (every branch). The default for every store, like `allowAll`. */
export const globalScope = async () => GLOBAL_SCOPE;
