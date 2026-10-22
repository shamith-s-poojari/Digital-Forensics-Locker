// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletProvider } from "./WalletContext.jsx";
import { useWallet } from "./walletContext.js";

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";

function Probe() {
  const { account, connect, disconnect, error, isConnecting } = useWallet();
  return (
    <div>
      <p data-testid="account">{account ?? "none"}</p>
      <p data-testid="connecting">{String(isConnecting)}</p>
      {error && <p role="alert">{error}</p>}
      <button onClick={connect}>connect</button>
      <button onClick={disconnect}>disconnect</button>
    </div>
  );
}

/** Minimal EIP-1193 provider with a listener registry. */
function createFakeEthereum(request) {
  const listeners = new Map();
  return {
    request,
    on: vi.fn((event, handler) => {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    }),
    removeListener: vi.fn((event, handler) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((h) => h !== handler)
      );
    }),
    emit: (event, payload) => (listeners.get(event) ?? []).forEach((handler) => handler(payload)),
    listenerCount: (event) => (listeners.get(event) ?? []).length,
  };
}

const renderProbe = () =>
  render(
    <WalletProvider>
      <Probe />
    </WalletProvider>
  );

describe("WalletProvider", () => {
  beforeEach(() => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    delete window.ethereum;
    vi.restoreAllMocks();
  });

  it("connects and exposes the account", async () => {
    window.ethereum = createFakeEthereum(vi.fn().mockResolvedValue([ADDRESS_A]));
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByText("connect"));

    expect(screen.getByTestId("account").textContent).toBe(ADDRESS_A);
    expect(screen.getByTestId("connecting").textContent).toBe("false");
    expect(window.ethereum.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
  });

  it("reports a missing wallet through `error` instead of alert()", async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByText("connect"));

    expect(screen.getByRole("alert").textContent).toMatch(/no ethereum wallet detected/i);
    expect(screen.getByTestId("account").textContent).toBe("none");
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("handles a user-rejected request (code 4001)", async () => {
    window.ethereum = createFakeEthereum(vi.fn().mockRejectedValue(Object.assign(new Error("User rejected"), { code: 4001 })));
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByText("connect"));

    expect(screen.getByRole("alert").textContent).toMatch(/rejected/i);
    expect(screen.getByTestId("account").textContent).toBe("none");
    expect(screen.getByTestId("connecting").textContent).toBe("false");
  });

  it("surfaces other connection errors without throwing", async () => {
    window.ethereum = createFakeEthereum(vi.fn().mockRejectedValue(new Error("boom")));
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByText("connect"));

    expect(screen.getByRole("alert").textContent).toMatch(/boom/);
  });

  it("reports isConnecting while the request is pending and ignores re-entrant clicks", async () => {
    let resolveRequest;
    const request = vi.fn(() => new Promise((resolve) => (resolveRequest = resolve)));
    window.ethereum = createFakeEthereum(request);
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByText("connect"));
    expect(screen.getByTestId("connecting").textContent).toBe("true");
    await user.click(screen.getByText("connect"));
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => resolveRequest([ADDRESS_A]));
    expect(screen.getByTestId("connecting").textContent).toBe("false");
    expect(screen.getByTestId("account").textContent).toBe(ADDRESS_A);
  });

  it("follows accountsChanged and clears the account on an empty list", async () => {
    window.ethereum = createFakeEthereum(vi.fn().mockResolvedValue([ADDRESS_A]));
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByText("connect"));

    act(() => window.ethereum.emit("accountsChanged", [ADDRESS_B]));
    expect(screen.getByTestId("account").textContent).toBe(ADDRESS_B);

    act(() => window.ethereum.emit("accountsChanged", []));
    expect(screen.getByTestId("account").textContent).toBe("none");
    expect(window.ethereum.listenerCount("accountsChanged")).toBe(0);
  });

  it("does not connect by itself when the wallet reports accounts while disconnected", async () => {
    window.ethereum = createFakeEthereum(vi.fn().mockResolvedValue([ADDRESS_A]));
    renderProbe();

    act(() => window.ethereum.emit("accountsChanged", [ADDRESS_B]));

    expect(screen.getByTestId("account").textContent).toBe("none");
  });

  it("removes its listener on disconnect and on unmount", async () => {
    window.ethereum = createFakeEthereum(vi.fn().mockResolvedValue([ADDRESS_A]));
    const user = userEvent.setup();
    const { unmount } = renderProbe();

    await user.click(screen.getByText("connect"));
    expect(window.ethereum.listenerCount("accountsChanged")).toBe(1);

    await user.click(screen.getByText("disconnect"));
    expect(screen.getByTestId("account").textContent).toBe("none");
    expect(window.ethereum.listenerCount("accountsChanged")).toBe(0);

    await user.click(screen.getByText("connect"));
    expect(window.ethereum.listenerCount("accountsChanged")).toBe(1);
    unmount();
    expect(window.ethereum.listenerCount("accountsChanged")).toBe(0);
  });
});
