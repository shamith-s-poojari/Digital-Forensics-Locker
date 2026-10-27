// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryLedger, createMemoryStore } from "./test/memoryLedger.js";
import App from "./App";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// The app talks to the in-memory test ledger instead of a contract; roles are set on its store, as a grant by the
// Chief would set them on chain.
const harness = vi.hoisted(() => ({ store: null }));
vi.mock("./web3/LedgerProvider.jsx", async (importOriginal) => {
  const real = await importOriginal();
  const config = { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", chainId: 11155111, chainName: "Sepolia", explorerUrl: "", configured: true, deployBlock: 0, invalidAddress: false };
  const createLedger = (account) => createMemoryLedger({ store: harness.store, account, signDelayMs: 0, confirmDelayMs: 0 });
  return { LedgerProvider: ({ children }) => <real.LedgerProvider config={config} createLedger={createLedger}>{children}</real.LedgerProvider> };
});

function installWallet() {
  window.ethereum = {
    request: vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") return [ACCOUNT];
      if (method === "eth_chainId") return "0xaa36a7";
      return null;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

function goTo(path) {
  act(() => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

async function connect() {
  await userEvent.click(screen.getAllByRole("button", { name: /Connect/ })[0]);
  await screen.findByRole("navigation", { name: "Main" });
}

const navNames = () => within(screen.getByRole("navigation", { name: "Main" })).queryAllByRole("link").map((a) => a.textContent);

/** Changes the connected wallet's role on the ledger (the app picks it up from the ledger's change events). */
function setRole(role) {
  act(() => harness.store.setRole(ACCOUNT, role));
}

beforeEach(() => {
  harness.store = createMemoryStore();
  harness.store.setRole(ACCOUNT, "investigator");
  window.history.pushState({}, "", "/");
  installWallet();
});
afterEach(() => {
  cleanup();
  delete window.ethereum;
});

describe("App: wallet gate and routing by role (in-memory ledger)", () => {
  it("shows nothing but the connect screen until a wallet is connected", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /Wallet Required/ })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Case Management" })).toBeNull();
  });

  it("sends / to the case dashboard once connected", async () => {
    render(<App />);
    await connect();
    expect(await screen.findByRole("heading", { name: "Case Management" })).toBeTruthy();
    expect(window.location.pathname).toBe("/cases");
  });

  it("gives an Investigator the upload page and its link", async () => {
    render(<App />);
    await connect();
    await screen.findByRole("heading", { name: "Case Management" });
    expect(navNames()).toContain("Evidence Upload");

    goTo("/upload");
    expect(await screen.findByRole("heading", { name: "Register Evidence" })).toBeTruthy();
  });

  it("keeps an Auditor out of the upload page and removes its link", async () => {
    render(<App />);
    await connect();
    setRole("auditor");
    await waitFor(() => expect(navNames()).toEqual(["Case Management"]));

    goTo("/upload");
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Register Evidence" })).toBeNull();
  });

  it("keeps the Chief out of evidence upload but lets them manage roles", async () => {
    render(<App />);
    await connect();
    setRole("admin");
    await waitFor(() => expect(navNames()).toContain("Role Management"));
    expect(navNames()).not.toContain("Evidence Upload");

    goTo("/upload");
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();

    goTo("/admin");
    expect(await screen.findByRole("heading", { name: "Role Management" })).toBeTruthy();
  });

  it("keeps an Investigator out of role management", async () => {
    render(<App />);
    await connect();
    await screen.findByRole("heading", { name: "Case Management" });
    goTo("/admin");
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.getByText(/Required: Admin/)).toBeTruthy();
  });

  it("tells a wallet that has no role to ask the Chief, and opens up once a role is granted", async () => {
    render(<App />);
    await connect();
    setRole("none");
    await waitFor(() => expect(screen.getByText(/has no role on this ledger/)).toBeTruthy());
    expect(navNames()).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Case Management" })).toBeNull();

    setRole("investigator");
    expect(await screen.findByRole("heading", { name: "Case Management" })).toBeTruthy();
  });

  it("shows a 404 for unknown pages", async () => {
    render(<App />);
    await connect();
    goTo("/definitely-not-a-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
