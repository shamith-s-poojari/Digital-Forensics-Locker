import { describe, expect, it } from "vitest";
import { CAPABILITIES, can, landingRoute, NO_ROLES, primaryRole, ROLE_LABELS, ROLES, ROUTE_CAPABILITY, rolesGranting, toRoleFlags } from "./roles.js";

const CHIEF = { isChief: true };
const ADMIN = { isAdmin: true };
const INVESTIGATOR = { isInvestigator: true };
const AUDITOR = { isAuditor: true };

describe("capability matrix", () => {
  const matrix = {
    // capability:                 [chief, admin, investigator, auditor, none]
    [CAPABILITIES.VIEW]: [true, true, true, true, false],
    [CAPABILITIES.UPLOAD]: [false, false, true, false, false],
    [CAPABILITIES.LOG_CUSTODY]: [false, false, true, false, false],
    [CAPABILITIES.TRANSFER]: [false, false, true, false, false],
    [CAPABILITIES.MANAGE_ROLES]: [true, true, false, false, false],
    [CAPABILITIES.MANAGE_ADMINS]: [true, false, false, false, false],
    [CAPABILITIES.PAUSE]: [true, true, false, false, false],
    [CAPABILITIES.REASSIGN]: [true, false, false, false, false],
  };

  for (const [capability, [chief, admin, investigator, auditor, none]] of Object.entries(matrix)) {
    it(`${capability}: chief=${chief} admin=${admin} investigator=${investigator} auditor=${auditor} none=${none}`, () => {
      expect(can(CHIEF, capability)).toBe(chief);
      expect(can(ADMIN, capability)).toBe(admin);
      expect(can(INVESTIGATOR, capability)).toBe(investigator);
      expect(can(AUDITOR, capability)).toBe(auditor);
      expect(can(NO_ROLES, capability)).toBe(none);
    });
  }

  it("keeps separation of duties: neither the Chief nor an Admin can write evidence on their own", () => {
    for (const c of [CAPABILITIES.UPLOAD, CAPABILITIES.LOG_CUSTODY, CAPABILITIES.TRANSFER]) {
      expect(can(CHIEF, c)).toBe(false);
      expect(can(ADMIN, c)).toBe(false);
    }
  });

  it("combines roles: a Chief who is also an Investigator can do both", () => {
    const both = { ...CHIEF, isInvestigator: true };
    expect(can(both, CAPABILITIES.UPLOAD)).toBe(true);
    expect(can(both, CAPABILITIES.MANAGE_ROLES)).toBe(true);
  });

  it("denies unknown capabilities and missing input", () => {
    expect(can(CHIEF, "launchMissiles")).toBe(false);
    expect(can(CHIEF, undefined)).toBe(false);
    expect(can(undefined, CAPABILITIES.VIEW)).toBe(false);
    expect(can(null, CAPABILITIES.VIEW)).toBe(false);
  });
});

describe("toRoleFlags", () => {
  it("accepts only literal true, so truthy junk can never grant a role", () => {
    expect(toRoleFlags({ isChief: "true", isInvestigator: 1, isAuditor: {} })).toEqual(NO_ROLES);
    expect(toRoleFlags({ isChief: true })).toEqual({ isChief: true, isAdmin: false, isInvestigator: false, isAuditor: false });
    expect(toRoleFlags(undefined)).toEqual(NO_ROLES);
  });
});

describe("primaryRole", () => {
  it("picks the most privileged role", () => {
    expect(primaryRole(CHIEF)).toBe(ROLES.CHIEF);
    expect(primaryRole(ADMIN)).toBe(ROLES.ADMIN);
    expect(primaryRole({ isAdmin: true, isInvestigator: true })).toBe(ROLES.ADMIN);
    expect(primaryRole({ isChief: true, isAdmin: true })).toBe(ROLES.CHIEF);
    expect(primaryRole(INVESTIGATOR)).toBe(ROLES.INVESTIGATOR);
    expect(primaryRole(AUDITOR)).toBe(ROLES.AUDITOR);
    expect(primaryRole(NO_ROLES)).toBe(ROLES.NONE);
    expect(primaryRole({ isChief: true, isInvestigator: true, isAuditor: true })).toBe(ROLES.CHIEF);
    expect(primaryRole({ isChief: false, isInvestigator: true, isAuditor: true })).toBe(ROLES.INVESTIGATOR);
  });

  it("has a label for every role", () => {
    for (const role of Object.values(ROLES)) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});

describe("rolesGranting", () => {
  it("names the roles that unlock a capability", () => {
    expect(rolesGranting(CAPABILITIES.UPLOAD)).toEqual([ROLE_LABELS.investigator]);
    expect(rolesGranting(CAPABILITIES.MANAGE_ROLES)).toEqual([ROLE_LABELS.chief, ROLE_LABELS.admin]);
    expect(rolesGranting(CAPABILITIES.MANAGE_ADMINS)).toEqual([ROLE_LABELS.chief]);
    expect(rolesGranting(CAPABILITIES.VIEW)).toHaveLength(4);
    expect(rolesGranting("nope")).toEqual([]);
  });
});

describe("ROUTE_CAPABILITY", () => {
  it("only references real capabilities", () => {
    const real = new Set(Object.values(CAPABILITIES));
    for (const [path, capability] of Object.entries(ROUTE_CAPABILITY)) {
      expect(real.has(capability), `${path} -> ${capability}`).toBe(true);
    }
  });

  it("protects the write and admin pages with the right capability", () => {
    expect(ROUTE_CAPABILITY["/upload"]).toBe(CAPABILITIES.UPLOAD);
    expect(ROUTE_CAPABILITY["/admin"]).toBe(CAPABILITIES.MANAGE_ROLES);
    expect(ROUTE_CAPABILITY["/cases"]).toBe(CAPABILITIES.VIEW);
  });
});

describe("landingRoute", () => {
  it("starts the Chief and Admins on role management, everyone else on the case dashboard", () => {
    expect(landingRoute(CHIEF)).toBe("/admin");
    expect(landingRoute(ADMIN)).toBe("/admin");
    expect(landingRoute(INVESTIGATOR)).toBe("/cases");
    expect(landingRoute(AUDITOR)).toBe("/cases");
    expect(landingRoute({ isChief: true, isInvestigator: true })).toBe("/admin");
  });

  it("has no landing page for a wallet without a role", () => {
    expect(landingRoute(NO_ROLES)).toBeNull();
    expect(landingRoute(undefined)).toBeNull();
  });
});
