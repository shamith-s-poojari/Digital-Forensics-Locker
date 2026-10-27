/**
 * Roles and capabilities, mirrored from contracts/contracts/EvidenceLocker.sol.
 *
 * IMPORTANT: this file only decides what the UI SHOWS. It is not a security boundary. The contract reverts every
 * unauthorised write, and the API re-checks roles on the server. Hiding a button never protects anything.
 */

export const ROLES = Object.freeze({
  NONE: "none",
  AUDITOR: "auditor",
  INVESTIGATOR: "investigator",
  ADMIN: "admin",
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.NONE]: "No role",
  [ROLES.AUDITOR]: "Auditor",
  [ROLES.INVESTIGATOR]: "Investigator",
  [ROLES.ADMIN]: "Admin (Chief)",
});

export const CAPABILITIES = Object.freeze({
  VIEW: "view", // see cases, evidence and the custody timeline; run read-only verification
  UPLOAD: "upload", // register new evidence
  LOG_CUSTODY: "logCustody", // log access, record verification on chain
  TRANSFER: "transfer", // hand custody to another investigator
  MANAGE_ROLES: "manageRoles", // grant and revoke Investigator / Auditor
  PAUSE: "pause", // pause and unpause all investigator writes
  REASSIGN: "reassign", // recover stranded custody
});

/** Which role flag unlocks which capability. Separation of duties: the admin has NO evidence-writing capability. */
const REQUIRED_FLAG = Object.freeze({
  [CAPABILITIES.VIEW]: ["isAdmin", "isInvestigator", "isAuditor"],
  [CAPABILITIES.UPLOAD]: ["isInvestigator"],
  [CAPABILITIES.LOG_CUSTODY]: ["isInvestigator"],
  [CAPABILITIES.TRANSFER]: ["isInvestigator"],
  [CAPABILITIES.MANAGE_ROLES]: ["isAdmin"],
  [CAPABILITIES.PAUSE]: ["isAdmin"],
  [CAPABILITIES.REASSIGN]: ["isAdmin"],
});

/**
 * Which capability each route needs. The single source of truth for both the route guards (App.jsx) and the
 * navigation (navLinks.js), so a link can never be shown for a page the user could not open, or vice versa.
 */
export const ROUTE_CAPABILITY = Object.freeze({
  "/cases": CAPABILITIES.VIEW,
  "/upload": CAPABILITIES.UPLOAD,
  "/admin": CAPABILITIES.MANAGE_ROLES,
});

export const NO_ROLES = Object.freeze({ isAdmin: false, isInvestigator: false, isAuditor: false });

/** Normalises whatever the ledger returned into three strict booleans. */
export function toRoleFlags(value) {
  return {
    isAdmin: value?.isAdmin === true,
    isInvestigator: value?.isInvestigator === true,
    isAuditor: value?.isAuditor === true,
  };
}

/** The single most privileged role, for badges. An address can hold several; use `can()` for decisions. */
export function primaryRole(flags) {
  const f = toRoleFlags(flags);
  if (f.isAdmin) return ROLES.ADMIN;
  if (f.isInvestigator) return ROLES.INVESTIGATOR;
  if (f.isAuditor) return ROLES.AUDITOR;
  return ROLES.NONE;
}

/** True if the role flags grant the capability. Unknown capabilities are denied. */
export function can(flags, capability) {
  const required = REQUIRED_FLAG[capability];
  if (!required) return false;
  const f = toRoleFlags(flags);
  return required.some((flag) => f[flag]);
}

/** Roles (as labels) that would grant a capability, for "you need X" messages. */
export function rolesGranting(capability) {
  const required = REQUIRED_FLAG[capability] ?? [];
  const byFlag = { isAdmin: ROLES.ADMIN, isInvestigator: ROLES.INVESTIGATOR, isAuditor: ROLES.AUDITOR };
  return required.map((flag) => ROLE_LABELS[byFlag[flag]]);
}

