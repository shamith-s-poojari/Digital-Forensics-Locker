// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { DEMO_ADMIN, DEMO_AUDITOR } from "./web3/demoLedger.js";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function installWallet(account = ACCOUNT) {
  window.ethereum = {
    request: vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") return [account];
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

beforeEach(() => {
  window.history.pushState({}, "", "/");
  installWallet();
});
afterEach(() => {
  cleanup();
  delete window.ethereum;
});

describe("App: wallet gate and routing by role (development build, demo ledger)", () => {
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

  it("shows the role read from the ledger next to the wallet address, and no development role picker", async () => {
    render(<App />);
    await connect();
    expect(await screen.findByText("Investigator", { selector: "[data-role]" })).toBeTruthy();
    expect(screen.queryByLabelText(/view the app as/)).toBeNull();
  });

  it("keeps an Auditor out of the upload page and removes its link", async () => {
    installWallet(DEMO_AUDITOR);
    render(<App />);
    await connect();
    await waitFor(() => expect(navNames()).toEqual(["Case Management", "Evidence Viewer", "Chain of Custody"]));

    goTo("/upload");
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Register Evidence" })).toBeNull();
  });

  it("keeps the Chief out of evidence upload but lets them manage roles", async () => {
    installWallet(DEMO_ADMIN);
    render(<App />);
    await connect();
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

  it("shows a 404 for unknown pages", async () => {
    render(<App />);
    await connect();
    goTo("/definitely-not-a-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
