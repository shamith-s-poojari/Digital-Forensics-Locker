// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { LedgerContext } from "../web3/ledgerContext.js";
import { CAPABILITIES } from "../web3/roles.js";
import { RoleProvider } from "./RoleContext.jsx";
import { useRole } from "./roleContext.js";
import { WalletContext } from "./walletContext.js";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const config = { address: null, chainId: 11155111, chainName: "Sepolia", explorerUrl: "", configured: true, deployBlock: 0, invalidAddress: false };

const ADMIN = { isAdmin: true, isInvestigator: false, isAuditor: false };
const INVESTIGATOR = { isAdmin: false, isInvestigator: true, isAuditor: false };
const NONE = { isAdmin: false, isInvestigator: false, isAuditor: false };

function Probe() {
  const { status, role, error, can, refresh, switchNetwork } = useRole();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="role">{role}</p>
      <p data-testid="upload">{String(can(CAPABILITIES.UPLOAD))}</p>
      <p data-testid="view">{String(can(CAPABILITIES.VIEW))}</p>
      <p data-testid="manage">{String(can(CAPABILITIES.MANAGE_ROLES))}</p>
      {error ? <p role="alert">{error}</p> : null}
      <button onClick={() => void refresh()}>refresh</button>
      <button onClick={() => void switchNetwork()}>switch</button>
    </div>
  );
}

function fakeLedger(getRoles) {
  let notify = null;
  const unsubscribe = vi.fn();
  return {
    kind: "chain",
    getRoles: vi.fn(getRoles),
    subscribe: vi.fn((cb) => {
      notify = cb;
      return unsubscribe;
    }),
    notify: () => notify?.(),
    unsubscribe,
  };
}

function setup({ account = A, mode = "chain", ledger, switchChain = vi.fn() } = {}) {
  const wallet = { account, chainId: 11155111, connect: vi.fn(), disconnect: vi.fn(), switchChain, error: null, isConnecting: false, clearError: vi.fn() };
  const tree = (acct, mod = mode, led = ledger) => (
    <WalletContext.Provider value={{ ...wallet, account: acct }}>
      <LedgerContext.Provider value={{ mode: mod, ledger: mod === "chain" || mod === "demo" ? led : null, config }}>
        <RoleProvider>
          <Probe />
        </RoleProvider>
      </LedgerContext.Provider>
    </WalletContext.Provider>
  );
  const utils = render(tree(account));
  return { ...utils, rerenderWith: (acct, mod, led) => utils.rerender(tree(acct, mod, led)), wallet };
}

const text = (id) => screen.getByTestId(id).textContent;

afterEach(cleanup);

describe("RoleProvider", () => {
  it("reports loading, then the roles read from the ledger", async () => {
    let resolve;
    const ledger = fakeLedger(() => new Promise((r) => (resolve = r)));
    setup({ ledger });

    expect(text("status")).toBe("loading");
    expect(text("view")).toBe("false"); // fails closed while unknown

    await act(async () => resolve(INVESTIGATOR));
    expect(text("status")).toBe("ready");
    expect(text("role")).toBe("investigator");
    expect(text("upload")).toBe("true");
    expect(text("manage")).toBe("false");
    expect(ledger.getRoles).toHaveBeenCalledWith(A);
  });

  it("denies everything when the roles cannot be read, and says why", async () => {
    const ledger = fakeLedger(async () => {
      throw Object.assign(new Error("rpc down"), { code: "NETWORK_ERROR" });
    });
    setup({ ledger });

    await waitFor(() => expect(text("status")).toBe("error"));
    expect(text("view")).toBe("false");
    expect(text("upload")).toBe("false");
    expect(screen.getByRole("alert").textContent).toMatch(/could not reach the blockchain network/i);
  });

  it("recovers from an error when refreshed", async () => {
    const getRoles = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValue(ADMIN);
    const ledger = fakeLedger(getRoles);
    setup({ ledger });
    await waitFor(() => expect(text("status")).toBe("error"));

    await act(async () => screen.getByText("refresh").click());
    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("role")).toBe("admin");
  });

  it("treats a malformed ledger answer as no role", async () => {
    const ledger = fakeLedger(async () => ({ isAdmin: "yes", isInvestigator: 1 }));
    setup({ ledger });
    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("role")).toBe("none");
    expect(text("view")).toBe("false");
  });

  it("never shows a previous account's roles after the account changes", async () => {
    let resolveB;
    const ledger = fakeLedger((account) => (account === A ? Promise.resolve(ADMIN) : new Promise((r) => (resolveB = r))));
    const { rerenderWith } = setup({ ledger });
    await waitFor(() => expect(text("role")).toBe("admin"));

    rerenderWith(B, "chain", ledger);
    // Account B's answer has not arrived: A's admin rights must not carry over.
    expect(text("status")).toBe("loading");
    expect(text("role")).toBe("none");
    expect(text("manage")).toBe("false");

    await act(async () => resolveB(NONE));
    expect(text("status")).toBe("ready");
    expect(text("role")).toBe("none");
  });

  it("ignores a slow answer for an old account that arrives after the new one", async () => {
    const resolvers = {};
    const ledger = fakeLedger((account) => new Promise((r) => (resolvers[account] = r)));
    const { rerenderWith } = setup({ ledger });
    await waitFor(() => expect(resolvers[A]).toBeTypeOf("function"));

    rerenderWith(B, "chain", ledger);
    await waitFor(() => expect(resolvers[B]).toBeTypeOf("function"));

    await act(async () => resolvers[B](NONE));
    await act(async () => resolvers[A](ADMIN)); // late and stale
    expect(text("role")).toBe("none");
    expect(text("manage")).toBe("false");
  });

  it("updates when roles change on the ledger (subscription)", async () => {
    let current = INVESTIGATOR;
    const ledger = fakeLedger(async () => current);
    setup({ ledger });
    await waitFor(() => expect(text("upload")).toBe("true"));

    current = NONE; // the Chief revokes this wallet
    await act(async () => ledger.notify());
    await waitFor(() => expect(text("upload")).toBe("false"));
    expect(text("role")).toBe("none");
  });

  it("unsubscribes when unmounted", async () => {
    const ledger = fakeLedger(async () => INVESTIGATOR);
    const { unmount } = setup({ ledger });
    await waitFor(() => expect(text("status")).toBe("ready"));
    unmount();
    expect(ledger.unsubscribe).toHaveBeenCalled();
  });

  describe("when there is no usable ledger", () => {
    it.each([
      ["no-wallet", "disconnected"],
      ["checking-network", "loading"],
      ["wrong-network", "wrong-network"],
      ["unconfigured", "unconfigured"],
      ["misconfigured", "misconfigured"],
    ])("mode %s -> status %s, and nothing is allowed", (mode, status) => {
      setup({ mode, ledger: null });
      expect(text("status")).toBe(status);
      expect(text("view")).toBe("false");
      expect(text("upload")).toBe("false");
      expect(text("manage")).toBe("false");
    });

    it("asks the wallet to switch to the contract's network", async () => {
      const switchChain = vi.fn();
      setup({ mode: "wrong-network", ledger: null, switchChain });
      await act(async () => screen.getByText("switch").click());
      expect(switchChain).toHaveBeenCalledWith(11155111);
    });
  });
});
