import { describe, expect, it } from "vitest";
import { CAPABILITIES, can, NO_ROLES, primaryRole, ROLE_LABELS, ROLES, ROUTE_CAPABILITY, rolesGranting, toRoleFlags } from "./roles.js";

const ADMIN = { isAdmin: true, isInvestigator: false, isAuditor: false };
const INVESTIGATOR = { isAdmin: false, isInvestigator: true, isAuditor: false };
const AUDITOR = { isAdmin: false, isInvestigator: false, isAuditor: true };

describe("capability matrix", () => {
  const matrix = {
    // capability:               [admin, investigator, auditor, none]
    [CAPABILITIES.VIEW]: [true, true, true, false],
    [CAPABILITIES.UPLOAD]: [false, true, false, false],
    [CAPABILITIES.LOG_CUSTODY]: [false, true, false, false],
    [CAPABILITIES.TRANSFER]: [false, true, false, false],
    [CAPABILITIES.MANAGE_ROLES]: [true, false, false, false],
    [CAPABILITIES.PAUSE]: [true, false, false, false],
    [CAPABILITIES.REASSIGN]: [true, false, false, false],
  };

  for (const [capability, [admin, investigator, auditor, none]] of Object.entries(matrix)) {
    it(`${capability}: admin=${admin} investigator=${investigator} auditor=${auditor} none=${none}`, () => {
      expect(can(ADMIN, capability)).toBe(admin);
      expect(can(INVESTIGATOR, capability)).toBe(investigator);
      expect(can(AUDITOR, capability)).toBe(auditor);
      expect(can(NO_ROLES, capability)).toBe(none);
    });
  }

  it("keeps separation of duties: the Chief has no evidence-writing capability on their own", () => {
    for (const c of [CAPABILITIES.UPLOAD, CAPABILITIES.LOG_CUSTODY, CAPABILITIES.TRANSFER]) expect(can(ADMIN, c)).toBe(false);
  });

  it("combines roles: a Chief who is also an Investigator can do both", () => {
    const both = { ...ADMIN, isInvestigator: true };
    expect(can(both, CAPABILITIES.UPLOAD)).toBe(true);
    expect(can(both, CAPABILITIES.MANAGE_ROLES)).toBe(true);
  });

  it("denies unknown capabilities and missing input", () => {
    expect(can(ADMIN, "launchMissiles")).toBe(false);
    expect(can(ADMIN, undefined)).toBe(false);
    expect(can(undefined, CAPABILITIES.VIEW)).toBe(false);
    expect(can(null, CAPABILITIES.VIEW)).toBe(false);
  });
});

describe("toRoleFlags", () => {
  it("accepts only literal true, so truthy junk can never grant a role", () => {
    expect(toRoleFlags({ isAdmin: "true", isInvestigator: 1, isAuditor: {} })).toEqual(NO_ROLES);
    expect(toRoleFlags({ isAdmin: true })).toEqual({ isAdmin: true, isInvestigator: false, isAuditor: false });
    expect(toRoleFlags(undefined)).toEqual(NO_ROLES);
  });
});

describe("primaryRole", () => {
  it("picks the most privileged role", () => {
    expect(primaryRole(ADMIN)).toBe(ROLES.ADMIN);
    expect(primaryRole(INVESTIGATOR)).toBe(ROLES.INVESTIGATOR);
    expect(primaryRole(AUDITOR)).toBe(ROLES.AUDITOR);
    expect(primaryRole(NO_ROLES)).toBe(ROLES.NONE);
    expect(primaryRole({ isAdmin: true, isInvestigator: true, isAuditor: true })).toBe(ROLES.ADMIN);
    expect(primaryRole({ isAdmin: false, isInvestigator: true, isAuditor: true })).toBe(ROLES.INVESTIGATOR);
  });

  it("has a label for every role", () => {
    for (const role of Object.values(ROLES)) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});

describe("rolesGranting", () => {
  it("names the roles that unlock a capability", () => {
    expect(rolesGranting(CAPABILITIES.UPLOAD)).toEqual([ROLE_LABELS.investigator]);
    expect(rolesGranting(CAPABILITIES.MANAGE_ROLES)).toEqual([ROLE_LABELS.admin]);
    expect(rolesGranting(CAPABILITIES.VIEW)).toHaveLength(3);
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
