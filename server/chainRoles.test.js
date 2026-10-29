import { describe, expect, it, vi } from "vitest";
import { CAPABILITIES } from "../src/web3/roles.js";
import { createRoleGate, ROLE_CACHE_MS } from "./chainRoles.js";

const ALICE = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const session = { address: ALICE };

describe("createRoleGate", () => {
  it("allows what the on-chain role grants and refuses the rest with 403", async () => {
    const gate = createRoleGate({ readRoles: async () => ({ isAuditor: true }) });
    expect(await gate.check(session, CAPABILITIES.VIEW)).toBeNull();
    const denied = await gate.check(session, CAPABILITIES.UPLOAD);
    expect(denied.status).toBe(403);
    expect(denied.error).toMatch(/Required: Investigator/);
  });

  it("refuses a wallet with no role, and a request with no session", async () => {
    const gate = createRoleGate({ readRoles: async () => ({}) });
    expect((await gate.check(session, CAPABILITIES.VIEW)).status).toBe(403);
    expect((await gate.check(null, CAPABILITIES.VIEW)).status).toBe(401);
  });

  it("fails closed when the contract cannot be read", async () => {
    const gate = createRoleGate({
      readRoles: async () => {
        throw new Error("rpc down");
      },
    });
    expect((await gate.check(session, CAPABILITIES.VIEW)).status).toBe(503);
  });

  it("refuses everything when a contract is configured but cannot be reached at all", async () => {
    const gate = createRoleGate({ readRoles: null, misconfigured: "RPC_URL is not set." });
    expect(await gate.check(session, CAPABILITIES.VIEW)).toEqual({ status: 503, error: "RPC_URL is not set." });
  });

  it("grants nothing without a contract, except on the dev server's demo ledger", async () => {
    expect((await createRoleGate({ readRoles: null }).check(session, CAPABILITIES.VIEW)).status).toBe(503);
    expect(await createRoleGate({ readRoles: null, allowWithoutContract: true }).check(session, CAPABILITIES.UPLOAD)).toBeNull();
  });

  it("caches roles per address for a short time, and never caches a failed read", async () => {
    let clock = 0;
    const readRoles = vi.fn(async () => ({ isInvestigator: true }));
    const gate = createRoleGate({ readRoles, now: () => clock });
    await gate.check(session, CAPABILITIES.VIEW);
    await gate.check({ address: ALICE.toLowerCase() }, CAPABILITIES.UPLOAD);
    expect(readRoles).toHaveBeenCalledTimes(1);
    clock += ROLE_CACHE_MS;
    await gate.check(session, CAPABILITIES.VIEW);
    expect(readRoles).toHaveBeenCalledTimes(2);

    const flaky = vi.fn().mockRejectedValueOnce(new Error("rpc down")).mockResolvedValue({ isAuditor: true });
    const retrying = createRoleGate({ readRoles: flaky, now: () => 0 });
    expect((await retrying.check(session, CAPABILITIES.VIEW)).status).toBe(503);
    expect(await retrying.check(session, CAPABILITIES.VIEW)).toBeNull();
  });
});
