// @vitest-environment jsdom
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { WalletContext } from "../context/walletContext.js";
import { LedgerContext } from "../web3/ledgerContext.js";
import { AccessRequestProvider } from "./AccessRequestProvider.jsx";
import { useAccessRequests } from "./accessRequestContext.js";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const REQUEST = { id: "r1", status: "pending" };
const unauthorized = () => Object.assign(new Error("Sign in with your wallet first."), { status: 401 });

let requests;
function Probe() {
  const value = useAccessRequests();
  useEffect(() => {
    requests = value;
  });
  return <p data-testid="status">{value.status}</p>;
}

function tree(store, wallet) {
  return (
    <WalletContext.Provider value={{ account: ACCOUNT, ensureSession: async () => ({ ok: true }), ...wallet }}>
      <LedgerContext.Provider value={{ mode: "chain" }}>
        <AccessRequestProvider store={store}>
          <Probe />
        </AccessRequestProvider>
      </LedgerContext.Provider>
    </WalletContext.Provider>
  );
}

const status = () => screen.getByTestId("status").textContent;

afterEach(cleanup);

describe("AccessRequestProvider: signing in", () => {
  it("is not left loading by a reload that finishes after the sign-in moved the key on", async () => {
    let finishSlowRead;
    const slowRead = new Promise((resolve) => {
      finishSlowRead = resolve;
    });
    const store = {
      kind: "server",
      list: vi.fn().mockResolvedValue([]),
      mine: vi
        .fn()
        .mockRejectedValueOnce(unauthorized()) // first read, signed out
        .mockReturnValueOnce(slowRead) // the reload, started before the sign-in is rendered
        .mockResolvedValue(REQUEST), // the read the sign-in triggers
    };
    const { rerender } = render(tree(store, { isSignedIn: false }));
    await waitFor(() => expect(status()).toBe("signed-out"));

    const staleReload = requests.reload();
    rerender(tree(store, { isSignedIn: true }));
    await waitFor(() => expect(status()).toBe("ready"));

    await act(async () => {
      finishSlowRead(null);
      await staleReload;
    });
    expect(status()).toBe("ready");
    expect(requests.mine).toEqual(REQUEST);
  });

  it("shows a request submitted by the action that also signed in", async () => {
    const store = {
      kind: "server",
      list: vi.fn().mockResolvedValue([]),
      mine: vi.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValue(REQUEST),
      submit: vi.fn().mockResolvedValue(REQUEST),
    };
    const { rerender } = render(tree(store, { isSignedIn: false }));
    await waitFor(() => expect(status()).toBe("signed-out"));

    const submitBeforeSignIn = requests.submit; // holds the render from before the sign-in
    rerender(tree(store, { isSignedIn: true }));
    await act(async () => {
      await submitBeforeSignIn({ role: "investigator", branchId: 1, reason: "test" });
    });
    await waitFor(() => expect(status()).toBe("ready"));
    expect(requests.mine).toEqual(REQUEST);
  });
});
