// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Layout from "./Layout";
import { WalletContext } from "../context/walletContext.js";
import { RoleTestProvider } from "../test/RoleTestProvider.jsx";

const ACCOUNT = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
const SUFFIX = "Digital Forensics Locker";

/**
 * jsdom has no matchMedia. This installs a controllable one: `(max-width: ...)` queries follow
 * `mobile`, reduced-motion follows `reducedMotion`, and setMobile() fires the change listeners
 * like a real viewport resize would.
 */
function installMatchMedia({ mobile = false, reducedMotion = false } = {}) {
  const state = { mobile, listeners: new Set() };
  window.matchMedia = vi.fn((query) => ({
    media: query,
    get matches() {
      if (query.includes("reduced-motion")) return reducedMotion;
      if (query.includes("max-width")) return state.mobile;
      return false;
    },
    addEventListener: (_type, listener) => state.listeners.add(listener),
    removeEventListener: (_type, listener) => state.listeners.delete(listener),
  }));
  return {
    state,
    setMobile(value) {
      state.mobile = value;
      act(() => {
        state.listeners.forEach((listener) => listener());
      });
    },
  };
}

function renderLayout({ account = ACCOUNT, path = "/", wallet = {}, children = <p>PAGE-BODY</p> } = {}) {
  const value = {
    account,
    connect: vi.fn(),
    disconnect: vi.fn(),
    error: null,
    isConnecting: false,
    clearError: vi.fn(),
    ...wallet,
  };
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <WalletContext.Provider value={value}>
        <RoleTestProvider isDemo>
          <Layout>{children}</Layout>
        </RoleTestProvider>
      </WalletContext.Provider>
    </MemoryRouter>
  );
  return { ...utils, wallet: value };
}

const getToggle = () => screen.getByRole("button", { name: "Navigation menu" });
const getSidebar = () => document.getElementById("app-sidebar");
const getMain = () => document.querySelector("main");

afterEach(() => {
  cleanup();
  delete window.matchMedia;
  document.title = "";
  document.body.removeAttribute("style");
});

describe("Layout accessibility basics", () => {
  beforeEach(() => {
    installMatchMedia({ mobile: false });
  });

  it("makes the skip link the first focusable element and moves focus to <main>", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.tab();
    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(document.activeElement).toBe(skipLink);
    expect(skipLink.getAttribute("href")).toBe("#main-content");

    await user.keyboard("{Enter}");
    const main = getMain();
    expect(main.id).toBe("main-content");
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(main);
  });

  it("renders the page body inside a single <main> landmark and the banner", () => {
    renderLayout();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main").textContent).toContain("PAGE-BODY");
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/sample data only/);
  });

  it("labels the toggle and wires aria-expanded / aria-controls to the sidebar", () => {
    renderLayout();
    const toggle = getToggle();
    expect(toggle.getAttribute("aria-controls")).toBe("app-sidebar");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(getSidebar()).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });
});

describe("Layout without a connected wallet", () => {
  beforeEach(() => {
    installMatchMedia({ mobile: false });
  });

  it("shows the restricted screen, hides the page and offers a connect button", () => {
    const { wallet } = renderLayout({ account: null });

    expect(screen.getByRole("heading", { level: 1, name: "Wallet Required" })).toBeTruthy();
    expect(screen.queryByText("PAGE-BODY")).toBeNull();
    expect(getSidebar()).toBeNull();
    expect(screen.queryByRole("button", { name: "Navigation menu" })).toBeNull();
    expect(screen.getByText(/not authorization/i)).toBeTruthy();
    // The skip link still has a target.
    expect(getMain().id).toBe("main-content");

    fireEvent.click(screen.getByRole("button", { name: /Connect Wallet to Proceed/ }));
    expect(wallet.connect).toHaveBeenCalledTimes(1);
  });

  it("shows a wallet error as an alert", () => {
    renderLayout({ account: null, wallet: { error: "MetaMask is not installed." } });
    expect(screen.getByRole("alert").textContent).toBe("MetaMask is not installed.");
  });

  it("sets a neutral document title", () => {
    renderLayout({ account: null });
    expect(document.title).toBe(`Connect wallet — ${SUFFIX}`);
  });
});

describe("Layout document title", () => {
  beforeEach(() => {
    installMatchMedia({ mobile: false });
  });

  it.each([
    ["/", "Case Management"],
    ["/upload", "Evidence Upload"],
    ["/evidence", "Evidence Viewer"],
    ["/custody", "Chain of Custody"],
    ["/cases", "Case Management"],
    ["/cases/", "Case Management"],
  ])("uses the page name for %s", (path, name) => {
    renderLayout({ path });
    expect(document.title).toBe(`${name} — ${SUFFIX}`);
  });

  it('falls back to "Not found" for unknown paths', () => {
    renderLayout({ path: "/nope" });
    expect(document.title).toBe(`Not found — ${SUFFIX}`);
  });

  it("restores the previous title on unmount", () => {
    document.title = "Before";
    const { unmount } = renderLayout();
    expect(document.title).toBe(`Case Management — ${SUFFIX}`);
    unmount();
    expect(document.title).toBe("Before");
  });
});

describe("Layout on desktop (>= 768px)", () => {
  beforeEach(() => {
    installMatchMedia({ mobile: false });
  });

  it("pushes the content right of a 240px sidebar and shows the clock", () => {
    renderLayout();
    expect(getSidebar().style.width).toBe("240px");
    expect(getSidebar().hasAttribute("inert")).toBe(false);
    expect(getMain().parentElement.style.marginLeft).toBe("240px");
    expect(getMain().style.padding).toBe("32px");
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("collapses and re-opens the sidebar with the toggle, making it inert while collapsed", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(getToggle());
    expect(getToggle().getAttribute("aria-expanded")).toBe("false");
    expect(getSidebar().style.width).toBe("0px");
    expect(getSidebar().hasAttribute("inert")).toBe(true);
    expect(getMain().parentElement.style.marginLeft).toBe("0px");

    await user.click(getToggle());
    expect(getToggle().getAttribute("aria-expanded")).toBe("true");
    expect(getSidebar().hasAttribute("inert")).toBe(false);
    expect(getMain().parentElement.style.marginLeft).toBe("240px");
  });

  it("does not show a drawer backdrop or lock body scroll", () => {
    renderLayout();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Layout on mobile (< 768px)", () => {
  let media;

  beforeEach(() => {
    media = installMatchMedia({ mobile: true });
  });

  it("starts with a closed, inert drawer, no left margin and 16px padding", () => {
    renderLayout();
    expect(getToggle().getAttribute("aria-expanded")).toBe("false");
    expect(getSidebar().hasAttribute("inert")).toBe(true);
    expect(getSidebar().style.transform).toBe("translateX(-100%)");
    expect(getMain().parentElement.style.marginLeft).toBe("0px");
    expect(getMain().style.padding).toBe("16px");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides the clock so the top bar cannot overflow", () => {
    renderLayout();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("opens the drawer as a modal dialog, moves focus into it and inerts the page", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(getToggle());

    expect(getToggle().getAttribute("aria-expanded")).toBe("true");
    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.hasAttribute("inert")).toBe(false);
    expect(dialog.style.transform).toBe("translateX(0)");
    expect(getMain().parentElement.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close navigation menu" }));
  });

  it("closes on Escape and gives focus back to the toggle", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(getToggle());
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getToggle().getAttribute("aria-expanded")).toBe("false");
    expect(getSidebar().hasAttribute("inert")).toBe(true);
    expect(getMain().parentElement.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(getToggle());
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await user.click(getToggle());
    const backdrop = container.querySelector('div[aria-hidden="true"][style*="position: fixed"]');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getToggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(getToggle());
  });

  it("closes with the in-drawer close button", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(getToggle());
    await user.click(screen.getByRole("button", { name: "Close navigation menu" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(getToggle());
  });

  it("closes after a nav link is clicked, navigates, and focuses the main content", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(getToggle());
    await user.click(screen.getByRole("link", { name: "Chain of Custody (sample)" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getToggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.title).toBe(`Chain of Custody — ${SUFFIX}`);
    expect(document.activeElement).toBe(getMain());
  });

  it("keeps Tab inside the open drawer", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(getToggle());
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll('a[href], button:not([disabled])');
    const last = focusable[focusable.length - 1];

    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(focusable[0]);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes the drawer when the viewport grows to desktop width, and does not reopen it", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(getToggle());
    expect(screen.getByRole("dialog")).toBeTruthy();

    media.setMobile(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getMain().parentElement.style.marginLeft).toBe("240px");
    expect(screen.getByRole("timer")).toBeTruthy();

    media.setMobile(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getToggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("uses a short title and a compact connect button when no wallet is connected", () => {
    renderLayout({ account: null });
    expect(screen.getByText("Forensics Locker")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeTruthy();
  });
});

describe("Layout without matchMedia (jsdom, old browsers)", () => {
  it("falls back to the desktop layout instead of throwing", () => {
    expect(window.matchMedia).toBeUndefined();
    renderLayout();
    expect(getSidebar().style.width).toBe("240px");
    expect(getToggle().getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Layout motion preference", () => {
  it("drops the sidebar transition when the user prefers reduced motion", () => {
    installMatchMedia({ mobile: false, reducedMotion: true });
    renderLayout();
    expect(getSidebar().style.transition).toBe("none");
  });
});
