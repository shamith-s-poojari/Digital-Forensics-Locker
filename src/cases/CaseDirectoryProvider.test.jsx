// @vitest-environment jsdom
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { WalletContext } from "../context/walletContext.js";
import { LedgerContext } from "../web3/ledgerContext.js";
import { CaseDirectoryProvider } from "./CaseDirectoryProvider.jsx";
import { useCaseDirectory } from "./caseDirectoryContext.js";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CASE = { caseRef: "0xabc", caseNumber: "CASE-1", versions: [] };
const unauthorized = () => Object.assign(new Error("Sign in with your wallet first."), { status: 401 });

let directory;
function Probe() {
  const value = useCaseDirectory();
  useEffect(() => {
    directory = value;
  });
  return <p data-testid="status">{value.status}</p>;
}

function tree(store, wallet) {
  return (
    <WalletContext.Provider value={{ account: ACCOUNT, ensureSession: async () => ({ ok: true }), ...wallet }}>
      <LedgerContext.Provider value={{ mode: "chain" }}>
        <CaseDirectoryProvider store={store}>
          <Probe />
        </CaseDirectoryProvider>
      </LedgerContext.Provider>
    </WalletContext.Provider>
  );
}

const status = () => screen.getByTestId("status").textContent;

afterEach(cleanup);

describe("CaseDirectoryProvider: signing in", () => {
  it("re-reads a server store after a sign-in, so an early 401 does not stick", async () => {
    const store = { kind: "server", list: vi.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValue([CASE]) };
    const { rerender } = render(tree(store, { isSignedIn: false }));
    await waitFor(() => expect(status()).toBe("signed-out"));

    rerender(tree(store, { isSignedIn: true }));
    await waitFor(() => expect(status()).toBe("ready"));
    expect(directory.byRef.get(CASE.caseRef)).toEqual(CASE);
  });

  it("stops showing cases once the session ends", async () => {
    const store = { kind: "server", list: vi.fn().mockResolvedValueOnce([CASE]).mockRejectedValue(unauthorized()) };
    const { rerender } = render(tree(store, { isSignedIn: true }));
    await waitFor(() => expect(status()).toBe("ready"));

    rerender(tree(store, { isSignedIn: false }));
    await waitFor(() => expect(status()).toBe("signed-out"));
    expect(directory.cases).toEqual([]);
  });

  it("does not re-read a store that needs no sign-in", async () => {
    const store = { kind: "demo", list: vi.fn().mockResolvedValue([CASE]) };
    const { rerender } = render(tree(store, { isSignedIn: false }));
    await waitFor(() => expect(status()).toBe("ready"));

    rerender(tree(store, { isSignedIn: true }));
    expect(status()).toBe("ready");
    expect(store.list).toHaveBeenCalledTimes(1);
  });

  it("is not left loading by a reload that finishes after the sign-in moved the key on", async () => {
    let finishSlowRead;
    const slowRead = new Promise((resolve) => {
      finishSlowRead = resolve;
    });
    const store = {
      kind: "server",
      list: vi
        .fn()
        .mockRejectedValueOnce(unauthorized()) // first read, signed out
        .mockReturnValueOnce(slowRead) // the reload, started before the sign-in is rendered
        .mockResolvedValue([CASE]), // the read the sign-in triggers
    };
    const { rerender } = render(tree(store, { isSignedIn: false }));
    await waitFor(() => expect(status()).toBe("signed-out"));

    const staleReload = directory.reload();
    rerender(tree(store, { isSignedIn: true }));
    await waitFor(() => expect(status()).toBe("ready"));

    await act(async () => {
      finishSlowRead([]);
      await staleReload;
    });
    expect(status()).toBe("ready");
    expect(directory.byRef.get(CASE.caseRef)).toEqual(CASE);
  });
});
