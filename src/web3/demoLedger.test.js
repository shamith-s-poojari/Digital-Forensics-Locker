import { describe, expect, it, vi } from "vitest";
import { getAddress } from "ethers";
import { createDemoLedger, createDemoStore } from "./demoLedger.js";
import { scenarios } from "./ledgerScenarios.js";

const ACTORS = {
  chief: "0x00000000000000000000000000000000000c0001",
  alice: "0x00000000000000000000000000000000000a0002",
  bob: "0x00000000000000000000000000000000000b0003",
  carol: "0x00000000000000000000000000000000000c0004",
  dave: "0x00000000000000000000000000000000000d0005",
};

/** A fresh, empty demo chain with the standard cast of actors. */
function makeContext() {
  const store = createDemoStore({ seed: false });
  let clock = 1_800_000_000;
  store.now = () => (clock += 60);
  store.admin = ACTORS.chief;
  store.roles.clear();
  store.setRole(ACTORS.chief, "admin");
  store.setRole(ACTORS.alice, "investigator");
  store.setRole(ACTORS.bob, "investigator");
  store.setRole(ACTORS.carol, "auditor");

  const checksummed = Object.fromEntries(Object.entries(ACTORS).map(([k, v]) => [k, getAddress(v)]));
  const ledgers = {};
  return {
    as: (name) => (ledgers[name] ??= createDemoLedger({ store, account: checksummed[name], signDelayMs: 0, confirmDelayMs: 0 })),
    address: (name) => checksummed[name],
  };
}

describe("demo ledger: shared scenarios (the same ones the real contract must pass)", () => {
  it.each(scenarios.map((s) => [s.name, s]))("%s", async (_name, scenario) => {
    await scenario.run(makeContext());
  });
});

describe("demo ledger: demo-specific behaviour", () => {
  it("seeds sample evidence whose custody hash chains verify", async () => {
    const store = createDemoStore();
    const ledger = createDemoLedger({ store, account: null, signDelayMs: 0, confirmDelayMs: 0 });
    const list = await ledger.listEvidence();
    expect(list.length).toBeGreaterThan(5);
    for (const ev of list) {
      expect(ev.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(await ledger.verifyChain(ev.id)).toBe(true);
    }
    // The sample data includes one flagged item, which shows up as a recorded mismatch.
    expect(list.some((ev) => ev.custody.some((c) => c.action === "VerifiedMismatch"))).toBe(true);
  });

  it("gives an account no powers until a preview role is set", async () => {
    const store = createDemoStore({ seed: false });
    const me = getAddress("0x00000000000000000000000000000000000e0006");
    const ledger = createDemoLedger({ store, account: me, signDelayMs: 0, confirmDelayMs: 0 });
    expect(await ledger.getRoles(me)).toEqual({ isAdmin: false, isInvestigator: false, isAuditor: false });

    ledger.setPreviewRole("investigator");
    expect((await ledger.getRoles(me)).isInvestigator).toBe(true);
    ledger.setPreviewRole("admin");
    expect(await ledger.getRoles(me)).toEqual({ isAdmin: true, isInvestigator: false, isAuditor: false });
  });

  it("notifies subscribers when a write is mined, and stops after unsubscribe", async () => {
    const store = createDemoStore({ seed: false });
    const me = getAddress("0x00000000000000000000000000000000000e0006");
    store.setRole(me, "investigator");
    const ledger = createDemoLedger({ store, account: me, signDelayMs: 0, confirmDelayMs: 0 });

    const onChange = vi.fn();
    const unsubscribe = ledger.subscribe(onChange);
    const handle = await ledger.registerEvidence({ caseRef: `0x${"ab".repeat(32)}`, sha256: "cd".repeat(32), cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" });
    await handle.wait();
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    unsubscribe();
    await (await ledger.logAccess(1)).wait();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("returns a transaction handle with a hash before it is mined", async () => {
    const store = createDemoStore({ seed: false });
    const me = getAddress("0x00000000000000000000000000000000000e0006");
    store.setRole(me, "investigator");
    const ledger = createDemoLedger({ store, account: me, signDelayMs: 0, confirmDelayMs: 0 });
    const handle = await ledger.registerEvidence({ caseRef: `0x${"ab".repeat(32)}`, sha256: "cd".repeat(32), cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" });
    expect(handle.hash).toMatch(/^0x[0-9a-f]{64}$/);
    const mined = await handle.wait();
    expect(mined.evidenceId).toBe(1);
    expect(mined.blockNumber).toBeGreaterThan(1000);
  });
});
