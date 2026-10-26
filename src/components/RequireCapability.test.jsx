// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { WalletContext } from "../context/walletContext.js";
import { RoleTestProvider } from "../test/RoleTestProvider.jsx";
import { CAPABILITIES } from "../web3/roles.js";
import Can from "./Can";
import RequireCapability from "./RequireCapability";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const wallet = { account: ACCOUNT, chainId: 1, connect: vi.fn(), disconnect: vi.fn(), switchChain: vi.fn(), error: null, isConnecting: false, clearError: vi.fn() };

function renderGuard(roleProps, capability = CAPABILITIES.UPLOAD) {
  return render(
    <MemoryRouter>
      <WalletContext.Provider value={wallet}>
        <RoleTestProvider {...roleProps}>
          <RequireCapability capability={capability}>
            <p>SECRET-PAGE</p>
          </RequireCapability>
        </RoleTestProvider>
      </WalletContext.Provider>
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("RequireCapability", () => {
  it("shows the page to a role that has the capability", () => {
    renderGuard({ roles: { isInvestigator: true } });
    expect(screen.getByText("SECRET-PAGE")).toBeTruthy();
  });

  it("blocks an Auditor from an investigator-only page and says what is required", () => {
    renderGuard({ roles: { isAuditor: true } });
    expect(screen.queryByText("SECRET-PAGE")).toBeNull();
    expect(screen.getByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.getByText(/Your role is/).textContent).toMatch(/Auditor/);
    expect(screen.getByText(/Required: Investigator/)).toBeTruthy();
  });

  it("blocks the Chief from evidence upload (separation of duties)", () => {
    renderGuard({ roles: { isAdmin: true } });
    expect(screen.queryByText("SECRET-PAGE")).toBeNull();
    expect(screen.getByRole("heading", { name: "Not authorised" })).toBeTruthy();
  });

  it("tells a wallet with no role to ask the Chief", () => {
    renderGuard({ roles: {} }, CAPABILITIES.VIEW);
    expect(screen.queryByText("SECRET-PAGE")).toBeNull();
    expect(screen.getByText(/has no role on this ledger/)).toBeTruthy();
    expect(screen.getByText(/Ask the Chief/)).toBeTruthy();
  });

  it("links back to the case dashboard from the denial", () => {
    renderGuard({ roles: { isAuditor: true } });
    expect(screen.getByRole("link", { name: /case dashboard/i }).getAttribute("href")).toBe("/cases");
  });

  it("shows a loading state while the role is being read, never the page", () => {
    renderGuard({ status: "loading", roles: { isAdmin: true, isInvestigator: true } });
    expect(screen.queryByText("SECRET-PAGE")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/checking your role/i);
  });

  it("denies when the role could not be read, offering a retry", async () => {
    const refresh = vi.fn(async () => {});
    renderGuard({ status: "error", error: "Could not reach the blockchain network.", refresh, roles: { isAdmin: true } });
    expect(screen.queryByText("SECRET-PAGE")).toBeNull();
    expect(screen.getByText(/Could not reach the blockchain network/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("offers a network switch on the wrong network", async () => {
    const switchNetwork = vi.fn(async () => true);
    renderGuard({ status: "wrong-network", switchNetwork });
    expect(screen.queryByText("SECRET-PAGE")).toBeNull();
    expect(screen.getByRole("heading", { name: /Switch to Sepolia/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Switch network" }));
    expect(switchNetwork).toHaveBeenCalled();
  });

  it.each(["unconfigured", "misconfigured"])("denies everyone when the ledger is %s", (status) => {
    renderGuard({ status, roles: { isAdmin: true, isInvestigator: true } });
    expect(screen.queryByText("SECRET-PAGE")).toBeNull();
    expect(screen.getByRole("region").textContent).toMatch(/VITE_LOCKER_ADDRESS/);
  });
});

describe("Can", () => {
  const renderCan = (roleProps) =>
    render(
      <RoleTestProvider {...roleProps}>
        <Can capability={CAPABILITIES.UPLOAD} fallback={<span>FALLBACK</span>}>
          <button>Upload Evidence</button>
        </Can>
      </RoleTestProvider>
    );

  it("renders children for a role that may, and the fallback otherwise", () => {
    renderCan({ roles: { isInvestigator: true } });
    expect(screen.getByRole("button", { name: "Upload Evidence" })).toBeTruthy();
    cleanup();
    renderCan({ roles: { isAuditor: true } });
    expect(screen.queryByRole("button", { name: "Upload Evidence" })).toBeNull();
    expect(screen.getByText("FALLBACK")).toBeTruthy();
  });

  it("renders nothing by default when not allowed", () => {
    const { container } = render(
      <RoleTestProvider roles={{ isAuditor: true }}>
        <Can capability={CAPABILITIES.UPLOAD}>
          <button>Upload Evidence</button>
        </Can>
      </RoleTestProvider>
    );
    expect(container.textContent).toBe("");
  });

  it.each(["loading", "error", "wrong-network", "unconfigured"])("hides content while the status is %s, whatever the roles say", (status) => {
    renderCan({ status, roles: { isAdmin: true, isInvestigator: true } });
    expect(screen.queryByRole("button", { name: "Upload Evidence" })).toBeNull();
  });
});
