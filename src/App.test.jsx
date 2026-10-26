// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

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

async function previewAs(role) {
  await userEvent.selectOptions(await screen.findByLabelText(/view the app as/), role);
}

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

  it("keeps an Auditor out of the upload page and removes its link", async () => {
    render(<App />);
    await connect();
    await previewAs("auditor");
    await waitFor(() => expect(navNames()).toEqual(["Case Management", "Evidence Viewer (sample)", "Chain of Custody (sample)"]));

    goTo("/upload");
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Register Evidence" })).toBeNull();
  });

  it("keeps the Chief out of evidence upload but lets them manage roles", async () => {
    render(<App />);
    await connect();
    await previewAs("admin");
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

  it("tells a wallet that has no role to ask the Chief, on every page", async () => {
    render(<App />);
    await connect();
    await previewAs("none");
    await waitFor(() => expect(screen.getByText(/has no role on this ledger/)).toBeTruthy());
    expect(navNames()).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Case Management" })).toBeNull();

    // The previewer stays available, so a developer is never locked out of switching back.
    await previewAs("investigator");
    expect(await screen.findByRole("heading", { name: "Case Management" })).toBeTruthy();
  });

  it("shows a 404 for unknown pages", async () => {
    render(<App />);
    await connect();
    goTo("/definitely-not-a-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
