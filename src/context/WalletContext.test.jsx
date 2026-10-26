// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getBytes, toUtf8String, Wallet } from "ethers";
import { parseSiweMessage } from "../auth/siweMessage.js";
import { WalletProvider } from "./WalletContext.jsx";
import { useWallet } from "./walletContext.js";

// Two real (throwaway, test-only) keys, so the provider's own signature check runs against real signatures.
// Fixed rather than random: Wallet.createRandom() trips over jsdom's Buffer realm.
const WALLET_A = new Wallet(`0x${"11".repeat(32)}`);
const WALLET_B = new Wallet(`0x${"22".repeat(32)}`);
const ADDRESS_A = WALLET_A.address;
const ADDRESS_B = WALLET_B.address;
const KEYS = new Map([
  [ADDRESS_A.toLowerCase(), WALLET_A],
  [ADDRESS_B.toLowerCase(), WALLET_B],
]);

function Probe() {
  const { account, connect, disconnect, error, isConnecting, isSignedIn, isSigningIn, signIn, ensureSession, notice } = useWallet();
  return (
    <div>
      <p data-testid="account">{account ?? "none"}</p>
      <p data-testid="connecting">{String(isConnecting)}</p>
      <p data-testid="signed-in">{String(isSignedIn)}</p>
      <p data-testid="signing-in">{String(isSigningIn)}</p>
      <p data-testid="notice">{notice ?? ""}</p>
      {error && <p role="alert">{error}</p>}
      <button onClick={connect}>connect</button>
      <button onClick={disconnect}>disconnect</button>
      <button onClick={() => void signIn()}>sign in</button>
      <button
        onClick={async () => {
          const result = await ensureSession();
          document.querySelector("[data-testid=ensure]").textContent = result.ok ? "ok" : result.error;
        }}
      >
        ensure
      </button>
      <p data-testid="ensure" />
    </div>
  );
}

/**
 * Minimal EIP-1193 wallet with a listener registry. `state.selected` is the account the wallet has selected
 * (null = locked); `personal_sign` signs with the real key of the requested address.
 */
function createFakeEthereum({ selected = ADDRESS_A, overrides = {} } = {}) {
  const listeners = new Map();
  const state = { selected, unlocked: true };
  const request = vi.fn(async ({ method, params }) => {
    if (overrides[method]) return overrides[method](params);
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return state.selected ? [state.selected] : [];
      case "eth_chainId":
        return "0xaa36a7";
      case "personal_sign": {
        const [hexMessage, address] = params;
        return KEYS.get(address.toLowerCase()).signMessage(toUtf8String(getBytes(hexMessage)));
      }
      default:
        throw new Error(`unexpected ${method}`);
    }
  });
  return {
    request,
    state,
    _metamask: { isUnlocked: async () => state.unlocked },
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
    signCount: () => request.mock.calls.filter(([arg]) => arg.method === "personal_sign").length,
  };
}

/** Stand-in for the server (server/siweAuth.js has its own tests): it records what it is sent and keeps one session. */
function createFakeAuthClient({ ttlMs = 60 * 60_000 } = {}) {
  const client = {
    session: null,
    verified: [],
    getNonce: vi.fn(async () => "a1b2c3d4e5f60718"),
    verify: vi.fn(async (message) => {
      const fields = parseSiweMessage(message);
      client.verified.push(fields);
      client.session = { address: fields.address, chainId: fields.chainId, expiresAt: Date.now() + ttlMs };
      return client.session;
    }),
    getSession: vi.fn(async () => client.session),
    logout: vi.fn(async () => {
      client.session = null;
    }),
  };
  return client;
}

let auth;
const renderProbe = () =>
  render(
    <WalletProvider authClient={auth}>
      <Probe />
    </WalletProvider>
  );
const text = (id) => screen.getByTestId(id).textContent;

describe("WalletProvider", () => {
  beforeEach(() => {
    auth = createFakeAuthClient();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    delete window.ethereum;
    vi.restoreAllMocks();
  });

  describe("connecting", () => {
    it("connects and exposes the account", async () => {
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));

      expect(text("account")).toBe(ADDRESS_A);
      expect(text("connecting")).toBe("false");
      expect(window.ethereum.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
    });

    it("reports a missing wallet through `error` instead of alert()", async () => {
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));

      expect(screen.getByRole("alert").textContent).toMatch(/no ethereum wallet detected/i);
      expect(text("account")).toBe("none");
      expect(window.alert).not.toHaveBeenCalled();
    });

    it("handles a user-rejected request (code 4001)", async () => {
      window.ethereum = createFakeEthereum({
        overrides: { eth_requestAccounts: () => Promise.reject(Object.assign(new Error("User rejected"), { code: 4001 })) },
      });
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));

      expect(screen.getByRole("alert").textContent).toMatch(/rejected/i);
      expect(text("account")).toBe("none");
      expect(text("connecting")).toBe("false");
      expect(auth.getNonce).not.toHaveBeenCalled();
    });

    it("surfaces other connection errors without throwing", async () => {
      window.ethereum = createFakeEthereum({ overrides: { eth_requestAccounts: () => Promise.reject(new Error("boom")) } });
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));

      expect(screen.getByRole("alert").textContent).toMatch(/boom/);
    });

    it("reports isConnecting while the request is pending and ignores re-entrant clicks", async () => {
      let resolveRequest;
      const requestAccounts = vi.fn(() => new Promise((resolve) => (resolveRequest = resolve)));
      window.ethereum = createFakeEthereum({ overrides: { eth_requestAccounts: requestAccounts } });
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));
      expect(text("connecting")).toBe("true");
      await user.click(screen.getByText("connect"));
      expect(requestAccounts).toHaveBeenCalledTimes(1);

      await act(async () => resolveRequest([ADDRESS_A]));
      expect(text("connecting")).toBe("false");
      expect(text("account")).toBe(ADDRESS_A);
    });

    it("does not connect by itself when the wallet reports accounts while disconnected", async () => {
      window.ethereum = createFakeEthereum();
      renderProbe();

      act(() => window.ethereum.emit("accountsChanged", [ADDRESS_B]));

      expect(text("account")).toBe("none");
    });
  });

  describe("signing in with a nonce", () => {
    it("asks for one signature over a server nonce when connecting, and is then signed in", async () => {
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));

      await waitFor(() => expect(text("signed-in")).toBe("true"));
      expect(window.ethereum.signCount()).toBe(1);
      const [fields] = auth.verified;
      expect(fields.address).toBe(ADDRESS_A);
      expect(fields.nonce).toBe("a1b2c3d4e5f60718");
      expect(fields.domain).toBe(window.location.host);
      expect(fields.uri).toBe(window.location.origin);
      expect(fields.chainId).toBe(11155111);
      expect(Date.parse(fields.expirationTime)).toBeGreaterThan(Date.parse(fields.issuedAt));
    });

    it("stays connected but signed out when the user declines the signature, and can sign in later", async () => {
      let decline = true;
      const ethereum = createFakeEthereum();
      const realRequest = ethereum.request.getMockImplementation();
      ethereum.request.mockImplementation((args) =>
        args.method === "personal_sign" && decline ? Promise.reject(Object.assign(new Error("denied"), { code: 4001 })) : realRequest(args)
      );
      window.ethereum = ethereum;
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Sign-in was cancelled/));
      expect(text("account")).toBe(ADDRESS_A);
      expect(text("signed-in")).toBe("false");
      expect(auth.verify).not.toHaveBeenCalled();

      decline = false;
      await user.click(screen.getByText("sign in"));
      await waitFor(() => expect(text("signed-in")).toBe("true"));
    });

    it("refuses a signature made by a different account than the one connected", async () => {
      window.ethereum = createFakeEthereum({ overrides: { personal_sign: ([hexMessage]) => WALLET_B.signMessage(toUtf8String(getBytes(hexMessage))) } });
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));

      await waitFor(() => expect(text("signing-in")).toBe("false"));
      expect(text("signed-in")).toBe("false");
      expect(auth.verify).not.toHaveBeenCalled();
    });

    it("reports a server refusal and stays signed out", async () => {
      auth.verify.mockRejectedValueOnce(new Error("Sign-in rejected: the sign-in request expired or was already used. Try again."));
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("connect"));

      await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/already used/));
      expect(text("signed-in")).toBe("false");
    });

    it("ends the server session on disconnect", async () => {
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();
      await user.click(screen.getByText("connect"));
      await waitFor(() => expect(text("signed-in")).toBe("true"));

      await user.click(screen.getByText("disconnect"));

      expect(text("account")).toBe("none");
      expect(text("signed-in")).toBe("false");
      expect(auth.logout).toHaveBeenCalledTimes(1);
    });

    it("resumes a still-valid server session on load when the wallet has the same account selected", async () => {
      auth.session = { address: ADDRESS_A, chainId: 11155111, expiresAt: Date.now() + 60_000 };
      window.ethereum = createFakeEthereum();
      renderProbe();

      await waitFor(() => expect(text("signed-in")).toBe("true"));
      expect(text("account")).toBe(ADDRESS_A);
      expect(window.ethereum.signCount()).toBe(0);
      expect(window.ethereum.request).not.toHaveBeenCalledWith({ method: "eth_requestAccounts" });
    });

    it("ends a leftover server session on load when the wallet now has another account selected", async () => {
      auth.session = { address: ADDRESS_A, chainId: 11155111, expiresAt: Date.now() + 60_000 };
      window.ethereum = createFakeEthereum({ selected: ADDRESS_B });
      renderProbe();

      await waitFor(() => expect(auth.logout).toHaveBeenCalled());
      expect(text("account")).toBe("none");
      expect(text("signed-in")).toBe("false");
    });

    it("signs out when the session expires", async () => {
      auth = createFakeAuthClient({ ttlMs: 50 });
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();
      await user.click(screen.getByText("connect"));

      await waitFor(() => expect(text("notice")).toMatch(/sign-in expired/i));
      expect(text("signed-in")).toBe("false");
      expect(text("account")).toBe(ADDRESS_A);
    });
  });

  describe("following the wallet", () => {
    async function connectAndSignIn(options) {
      window.ethereum = createFakeEthereum(options);
      const user = userEvent.setup();
      const utils = renderProbe();
      await user.click(screen.getByText("connect"));
      await waitFor(() => expect(text("signed-in")).toBe("true"));
      return { user, ...utils };
    }

    it("follows an account switch and ends the old account's session", async () => {
      await connectAndSignIn();

      act(() => window.ethereum.emit("accountsChanged", [ADDRESS_B]));

      expect(text("account")).toBe(ADDRESS_B);
      expect(text("signed-in")).toBe("false");
      expect(text("notice")).toMatch(/switched to/);
      expect(auth.logout).toHaveBeenCalledTimes(1);
    });

    it("clears the account on an empty list and says the wallet was locked when MetaMask reports it", async () => {
      await connectAndSignIn();
      window.ethereum.state.unlocked = false;

      act(() => window.ethereum.emit("accountsChanged", []));

      expect(text("account")).toBe("none");
      expect(text("signed-in")).toBe("false");
      await waitFor(() => expect(text("notice")).toMatch(/wallet was locked/));
      expect(window.ethereum.listenerCount("accountsChanged")).toBe(0);
    });

    it("says the site was disconnected when the wallet is still unlocked", async () => {
      await connectAndSignIn();

      act(() => window.ethereum.emit("accountsChanged", []));

      expect(text("account")).toBe("none");
      expect(text("notice")).toMatch(/disconnected from this site/);
    });

    it("treats the provider's disconnect event as a disconnect", async () => {
      await connectAndSignIn();

      act(() => window.ethereum.emit("disconnect", { code: 4900 }));

      expect(text("account")).toBe("none");
      expect(auth.logout).toHaveBeenCalled();
    });

    it("re-reads the wallet when the window regains focus, catching a lock that sent no event", async () => {
      await connectAndSignIn();
      window.ethereum.state.selected = null;

      await act(async () => window.dispatchEvent(new Event("focus")));

      await waitFor(() => expect(text("account")).toBe("none"));
    });

    it("removes its listeners on disconnect and on unmount", async () => {
      const { user, unmount } = await connectAndSignIn();
      expect(window.ethereum.listenerCount("accountsChanged")).toBe(1);
      expect(window.ethereum.listenerCount("disconnect")).toBe(1);

      await user.click(screen.getByText("disconnect"));
      expect(text("account")).toBe("none");
      expect(window.ethereum.listenerCount("accountsChanged")).toBe(0);
      expect(window.ethereum.listenerCount("disconnect")).toBe(0);

      await user.click(screen.getByText("connect"));
      expect(window.ethereum.listenerCount("accountsChanged")).toBe(1);
      unmount();
      expect(window.ethereum.listenerCount("accountsChanged")).toBe(0);
    });
  });

  describe("ensureSession (called before every evidence action)", () => {
    it("passes without a new signature while the session is live", async () => {
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();
      await user.click(screen.getByText("connect"));
      await waitFor(() => expect(text("signed-in")).toBe("true"));

      await user.click(screen.getByText("ensure"));

      await waitFor(() => expect(text("ensure")).toBe("ok"));
      expect(window.ethereum.signCount()).toBe(1);
    });

    it("stops when the wallet switched account without an event, then asks the new account for a fresh signature", async () => {
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();
      await user.click(screen.getByText("connect"));
      await waitFor(() => expect(text("signed-in")).toBe("true"));
      window.ethereum.state.selected = ADDRESS_B; // switched in the wallet; no accountsChanged was delivered

      await user.click(screen.getByText("ensure"));
      await waitFor(() => expect(text("ensure")).toMatch(/switched to .*Nothing was sent/));
      expect(text("account")).toBe(ADDRESS_B);
      expect(text("signed-in")).toBe("false");
      expect(window.ethereum.signCount()).toBe(1);

      await user.click(screen.getByText("ensure"));
      await waitFor(() => expect(text("ensure")).toBe("ok"));
      expect(window.ethereum.signCount()).toBe(2);
      expect(auth.verified.at(-1).address).toBe(ADDRESS_B);
    });

    it("stops when the wallet was locked without an event", async () => {
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();
      await user.click(screen.getByText("connect"));
      await waitFor(() => expect(text("signed-in")).toBe("true"));
      window.ethereum.state.selected = null;

      await user.click(screen.getByText("ensure"));

      await waitFor(() => expect(text("ensure")).toMatch(/locked or disconnected/));
      expect(text("account")).toBe("none");
    });

    it("signs in again when the server no longer has the session (restart, cleared cookie)", async () => {
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();
      await user.click(screen.getByText("connect"));
      await waitFor(() => expect(text("signed-in")).toBe("true"));
      auth.session = null;

      await user.click(screen.getByText("ensure"));

      await waitFor(() => expect(text("ensure")).toBe("ok"));
      expect(window.ethereum.signCount()).toBe(2);
    });

    it("asks for a signature when connected but not signed in, and reports a declined one", async () => {
      const ethereum = createFakeEthereum();
      const realRequest = ethereum.request.getMockImplementation();
      ethereum.request.mockImplementation((args) => (args.method === "personal_sign" ? Promise.reject(Object.assign(new Error("denied"), { code: 4001 })) : realRequest(args)));
      window.ethereum = ethereum;
      const user = userEvent.setup();
      renderProbe();
      await user.click(screen.getByText("connect"));
      await waitFor(() => expect(text("signing-in")).toBe("false"));

      await user.click(screen.getByText("ensure"));

      await waitFor(() => expect(text("ensure")).toMatch(/Sign-in was cancelled/));
      expect(window.ethereum.signCount()).toBe(2);
    });

    it("refuses when no wallet is connected", async () => {
      window.ethereum = createFakeEthereum();
      const user = userEvent.setup();
      renderProbe();

      await user.click(screen.getByText("ensure"));

      await waitFor(() => expect(text("ensure")).toMatch(/Connect your wallet first/));
      expect(window.ethereum.signCount()).toBe(0);
    });
  });
});
