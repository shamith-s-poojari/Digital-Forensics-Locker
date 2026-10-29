// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "./Sidebar";
import { WalletContext } from "../context/walletContext.js";
import { RoleTestProvider } from "../test/RoleTestProvider.jsx";

const wallet = {
  account: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  connect: vi.fn(),
  disconnect: vi.fn(),
  error: null,
  isConnecting: false,
  clearError: vi.fn(),
};

const renderSidebar = (props = {}, path = "/cases", role = {}) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <WalletContext.Provider value={wallet}>
        <RoleTestProvider roles={{ isInvestigator: true }} isDemo {...role}>
          <Sidebar {...props} />
        </RoleTestProvider>
      </WalletContext.Provider>
    </MemoryRouter>
  );

afterEach(cleanup);

describe("Sidebar by role", () => {
  const names = () => within(screen.getByRole("navigation", { name: "Main" })).queryAllByRole("link").map((a) => a.textContent);

  it("shows an Auditor only the read-only destination", () => {
    renderSidebar({}, "/cases", { roles: { isAuditor: true }, isDemo: false });
    expect(names()).toEqual(["Dashboard", "Case Management"]);
  });

  it("shows an Investigator the dashboard and evidence upload", () => {
    renderSidebar({}, "/cases", { roles: { isInvestigator: true }, isDemo: false });
    expect(names()).toEqual(["Dashboard", "Case Management", "Evidence Upload"]);
  });

  it("shows the Chief the dashboard and role management, but not evidence upload", () => {
    renderSidebar({}, "/cases", { roles: { isChief: true }, isDemo: false });
    expect(names()).toEqual(["Dashboard", "Case Management", "Role Management"]);
  });

  it("shows someone holding both roles everything they may use", () => {
    renderSidebar({}, "/cases", { roles: { isChief: true, isInvestigator: true }, isDemo: false });
    expect(names()).toEqual(["Dashboard", "Case Management", "Evidence Upload", "Role Management"]);
  });

  it("lists nothing while the role is unknown or the wallet has no role (fails closed)", () => {
    renderSidebar({}, "/cases", { status: "loading", isDemo: false });
    expect(names()).toEqual([]);
    cleanup();
    renderSidebar({}, "/cases", { roles: {}, isDemo: false });
    expect(names()).toEqual([]);
    cleanup();
    renderSidebar({}, "/cases", { status: "error", roles: { isChief: true }, isDemo: false });
    expect(names()).toEqual([]);
  });

  it("shows the sample-data pages only in demo mode", () => {
    renderSidebar({}, "/cases", { roles: { isInvestigator: true }, isDemo: true });
    expect(names()).toContain("Evidence Viewer");
    cleanup();
    renderSidebar({}, "/cases", { roles: { isInvestigator: true }, isDemo: false });
    expect(names()).not.toContain("Evidence Viewer");
  });
});

describe("Sidebar", () => {
  it("is a labelled navigation landmark listing the destinations an Investigator may use (plus sample pages in development)", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const names = within(nav)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(names).toEqual(["Dashboard", "Case Management", "Evidence Upload", "Evidence Viewer", "Chain of Custody"]);
  });

  it("marks only the current page with aria-current", () => {
    renderSidebar({}, "/custody");
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["Chain of Custody"]);
    expect(screen.getByRole("link", { name: "Chain of Custody" }).style.fontWeight).toBe("700");
    expect(screen.getByRole("link", { name: "Case Management" }).style.fontWeight).toBe("500");
  });

  it("hides decorative icons from assistive technology", () => {
    const { container } = renderSidebar();
    const icons = container.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThanOrEqual(5);
    for (const icon of icons) expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("calls onNavigate when a link is clicked", () => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });
    fireEvent.click(screen.getByRole("link", { name: "Evidence Upload" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("works without onNavigate", () => {
    renderSidebar();
    expect(() => fireEvent.click(screen.getByRole("link", { name: "Evidence Upload" }))).not.toThrow();
  });

  it("highlights a hovered link without losing the active link's styling", () => {
    renderSidebar({}, "/cases");
    const active = screen.getByRole("link", { name: "Case Management" });
    const other = screen.getByRole("link", { name: "Evidence Viewer" });
    const activeBackground = active.style.background;

    fireEvent.mouseEnter(other);
    expect(other.style.background).toContain("rgba(51, 65, 85");
    fireEvent.mouseLeave(other);
    expect(other.style.background).toBe("transparent");

    // Hovering the active link must not repaint it (the old DOM-mutating handler did).
    fireEvent.mouseEnter(active);
    fireEvent.mouseLeave(active);
    expect(active.style.background).toBe(activeBackground);
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  it("uses readable (>= 4.5:1) text colors and no leftover mojibake", () => {
    const { container } = renderSidebar();
    expect(container.innerHTML).not.toContain("#484f58");
    expect(container.textContent).not.toMatch(/[ƒö≡]/);
    expect(screen.getByText("v1.0")).toBeTruthy();
    expect(container.textContent).not.toMatch(/demo/i);
    expect(container.textContent).not.toMatch(/sepolia/i);
  });
});
