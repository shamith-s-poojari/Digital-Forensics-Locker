import { describe, expect, it } from "vitest";
import { Interface } from "ethers";
import abi from "./EvidenceLocker.abi.json";
import { friendlyMessage, LedgerError, LEDGER_ERROR, normalizeError } from "./ledgerErrors.js";

const iface = new Interface(abi);
const encode = (name, args = []) => iface.encodeErrorResult(name, args);
const ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("normalizeError", () => {
  it("passes a LedgerError through unchanged", () => {
    const original = new LedgerError(LEDGER_ERROR.PAUSED);
    expect(normalizeError(original)).toBe(original);
  });

  it.each([
    ["ethers ACTION_REJECTED", { code: "ACTION_REJECTED" }],
    ["raw wallet 4001", { code: 4001 }],
    ["nested in info.error", { info: { error: { code: 4001 } } }],
    ["nested in error", { error: { code: 4001 } }],
  ])("recognises a wallet rejection: %s", (_label, err) => {
    expect(normalizeError(err).code).toBe(LEDGER_ERROR.USER_REJECTED);
  });

  describe("decodes contract reverts wherever the provider put the data", () => {
    const shapes = {
      "ethers revert field": (data, name, args) => ({ revert: { name, args } }),
      "errorName field": (data, name, args) => ({ errorName: name, errorArgs: args }),
      "err.data": (data) => ({ data }),
      "err.error.data": (data) => ({ error: { data } }),
      "err.info.error.data": (data) => ({ info: { error: { data } } }),
      "MetaMask-style nested originalError": (data) => ({ info: { error: { data: { originalError: { data } } } } }),
      "message text only (local nodes)": (_d, name) => ({ message: `VM Exception while processing transaction: reverted with custom error '${name}(1, 2)'` }),
    };

    for (const [shape, build] of Object.entries(shapes)) {
      it(`DuplicateEvidence with existing id via ${shape}`, () => {
        const e = normalizeError(build(encode("DuplicateEvidence", [7]), "DuplicateEvidence", [7n]), iface);
        expect(e.code).toBe(LEDGER_ERROR.DUPLICATE);
        if (!shape.startsWith("message text")) expect(e.details.existingId).toBe(7);
      });
    }

    it.each([
      ["AccessControlUnauthorizedAccount", [ADDRESS, `0x${"0".repeat(64)}`], LEDGER_ERROR.NOT_AUTHORIZED],
      ["EnforcedPause", [], LEDGER_ERROR.PAUSED],
      ["UnknownEvidence", [99], LEDGER_ERROR.UNKNOWN_EVIDENCE],
      ["NotCustodian", [ADDRESS], LEDGER_ERROR.NOT_CUSTODIAN],
      ["InvalidRecipient", [ADDRESS], LEDGER_ERROR.INVALID_RECIPIENT],
      ["ZeroValue", [], LEDGER_ERROR.INVALID_INPUT],
      ["InvalidCid", [], LEDGER_ERROR.INVALID_INPUT],
    ])("maps %s", (name, args, code) => {
      expect(normalizeError({ data: encode(name, args) }, iface).code).toBe(code);
    });

    it("exposes the custodian address for NotCustodian", () => {
      const e = normalizeError({ data: encode("NotCustodian", [ADDRESS]) }, iface);
      expect(e.details.custodian).toBe(ADDRESS);
    });

    it("ignores hex data that is not an error of this contract", () => {
      expect(normalizeError({ data: "0xdeadbeef" }, iface).code).toBe(LEDGER_ERROR.UNKNOWN);
    });

    it("does not loop forever on a circular error object", () => {
      const err = { code: "X" };
      err.self = err;
      expect(normalizeError(err, iface).code).toBe(LEDGER_ERROR.UNKNOWN);
    });
  });

  it("recognises funds and network problems", () => {
    expect(normalizeError({ code: "INSUFFICIENT_FUNDS" }).code).toBe(LEDGER_ERROR.INSUFFICIENT_FUNDS);
    for (const code of ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"]) {
      expect(normalizeError({ code }).code).toBe(LEDGER_ERROR.NETWORK);
    }
  });

  it("falls back to Unknown without leaking an unbounded message", () => {
    const e = normalizeError(new Error("boom"));
    expect(e.code).toBe(LEDGER_ERROR.UNKNOWN);
    expect(friendlyMessage(new Error("secret internal detail"))).not.toContain("secret internal detail");
  });
});

describe("friendlyMessage", () => {
  it("mentions the existing evidence id for duplicates", () => {
    expect(friendlyMessage(new LedgerError(LEDGER_ERROR.DUPLICATE, undefined, { existingId: 12 }))).toContain("#12");
  });

  it("has a human sentence for every error code", () => {
    for (const code of Object.values(LEDGER_ERROR)) {
      const text = friendlyMessage(new LedgerError(code));
      expect(text.length).toBeGreaterThan(15);
      expect(text).not.toMatch(/undefined|\[object/);
    }
  });
});
