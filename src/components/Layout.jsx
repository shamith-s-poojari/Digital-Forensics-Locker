import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, X, Wallet } from "lucide-react";
import AccessDenied from "./AccessDenied";
import AccountSwitcher from "./AccountSwitcher";
import Login from "./Login";
import Sidebar from "./Sidebar";
import Clock from "./Clock";
import SessionBanner from "./SessionBanner";
import { AccessState } from "./RequireCapability";
import { Spinner } from "./ui";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { useAuth } from "../context/authContext.js";
import { accountName } from "../web3/accountNames.js";

const APP_NAME = "Digital Forensics Locker";
const SIDEBAR_ID = "app-sidebar";
const MAIN_ID = "main-content";

// Below this width the sidebar becomes an overlay drawer and the layout loses its left margin.
const MOBILE_QUERY = "(max-width: 767px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PAGE_TITLES = {
  "/": "Dashboard", // "/" redirects to the role's landing page (landingRoute in roles.js)
  "/home": "Dashboard",
  "/cases": "Case Management",
  "/upload": "Evidence Upload",
  "/admin": "Role Management",
  "/evidence": "Evidence Viewer",
  "/custody": "Chain of Custody",
};

/**
 * Human-readable title for a route. Unknown paths get "Not found" (App.jsx renders a 404 page for them).
 */
function getPageTitle(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
  return PAGE_TITLES[normalized] ?? "Not found";
}

const truncateAddress = (addr) => (addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "");

// Pseudo-classes can't be written inline, so the few rules that need them live here.
// #93c5fd on the dark surfaces (#0f172a / #1e293b) is 8-10:1 (WCAG non-text contrast needs 3:1).
const SHELL_CSS = `
.dfl-skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 1000;
  padding: 10px 16px;
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  transform: translateY(-200%);
}
.dfl-skip-link:focus {
  transform: translateY(0);
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
.dfl-focusable:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
#${MAIN_ID}:focus {
  outline: none;
}
`;

/** Browser tab title while the gate is closed. */
const GATE_TITLES = {
  "signed-out": "Connect wallet",
  verifying: "Verifying role",
  denied: "Access denied",
  unavailable: "Access unavailable",
};

export default function Layout({ children }) {
  const { gate, account, role, roleLabel, connect, disconnect, isConnecting } = useAuth();
  const isConnected = Boolean(account);
  // The app itself (sidebar, pages) is only rendered once the contract confirms this wallet holds a role.
  const isGranted = gate === "granted";
  const location = useLocation();

  const isMobile = useMediaQuery(MOBILE_QUERY);
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  // Desktop (>= 768px): the sidebar pushes the content and the toggle collapses it.
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  // Mobile (< 768px): the sidebar is an overlay drawer that starts closed.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer when the viewport crosses the breakpoint or the wallet disconnects, so a
  // stale "open" flag can't pop it open later. (Adjusting state during render is the pattern
  // React recommends over an effect for this.)
  const resetKey = `${isMobile}:${isGranted}`;
  const [previousResetKey, setPreviousResetKey] = useState(resetKey);
  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey);
    setDrawerOpen(false);
  }

  const drawerVisible = isGranted && isMobile && drawerOpen;
  const sidebarExpanded = isMobile ? drawerOpen : desktopSidebarOpen;
  const sidebarPushesContent = isGranted && !isMobile && desktopSidebarOpen;

  const toggleRef = useRef(null);
  const drawerRef = useRef(null);
  const mainRef = useRef(null);
  const restoreFocusToRef = useRef("toggle");
  const drawerWasVisibleRef = useRef(false);

  const closeDrawer = useCallback((restoreFocusTo = "toggle") => {
    restoreFocusToRef.current = restoreFocusTo;
    setDrawerOpen(false);
  }, []);

  const handleToggle = () => {
    if (isMobile) {
      if (drawerOpen) closeDrawer("toggle");
      else setDrawerOpen(true);
    } else {
      setDesktopSidebarOpen((open) => !open);
    }
  };

  // Browser tab title: "<Page> — Digital Forensics Locker".
  const pageTitle = isGranted ? getPageTitle(location.pathname) : GATE_TITLES[gate];
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${pageTitle} — ${APP_NAME}`;
    return () => {
      document.title = previousTitle;
    };
  }, [pageTitle]);

  // Focus handling: move focus into the drawer when it opens, and put it back (on the toggle,
  // or on the main content after a navigation click) when it closes.
  useEffect(() => {
    if (drawerVisible) {
      const first = drawerRef.current?.querySelector(FOCUSABLE_SELECTOR);
      (first ?? drawerRef.current)?.focus();
    } else if (drawerWasVisibleRef.current) {
      const target = restoreFocusToRef.current === "main" ? mainRef.current : toggleRef.current;
      target?.focus();
      restoreFocusToRef.current = "toggle";
    }
    drawerWasVisibleRef.current = drawerVisible;
  }, [drawerVisible]);

  // While the drawer is open: Escape closes it and the page behind it doesn't scroll.
  useEffect(() => {
    if (!drawerVisible) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeDrawer("toggle");
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerVisible, closeDrawer]);

  // Keep Tab inside the open drawer (it is modal: the rest of the page is inert).
  const handleDrawerKeyDown = (event) => {
    if (!drawerVisible || event.key !== "Tab") return;
    const items = Array.from(drawerRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSkipLinkClick = (event) => {
    event.preventDefault();
    mainRef.current?.focus();
  };

  const motion = (value) => (reduceMotion ? "none" : value);
  const sidePadding = isMobile ? "16px" : "32px";

  const rootStyle = {
    display: "flex",
    width: "100%",
    minHeight: "100vh",
    background: "#0f172a",
    position: "relative",
  };

  // Desktop: a 240px column that animates to 0 width. Mobile: a fixed drawer that slides in.
  const sidebarWrapperStyle = isMobile
    ? {
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        width: "min(280px, 85vw)",
        zIndex: 120,
        transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
        transition: motion("transform 0.25s ease-in-out"),
        overflowX: "hidden",
        overflowY: "auto",
        backgroundColor: "#0f172a",
        borderRight: "1px solid #334155",
        boxShadow: drawerOpen ? "0 0 32px rgba(0,0,0,0.6)" : "none",
      }
    : {
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        width: desktopSidebarOpen ? "240px" : "0",
        zIndex: 100,
        transition: motion("width 0.3s ease-in-out"),
        overflowX: "hidden",
        overflowY: "auto",
        backgroundColor: "#0f172a",
        borderRight: desktopSidebarOpen ? "1px solid #334155" : "none",
      };

  const backdropStyle = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 110,
    background: "rgba(2,6,23,0.65)",
  };

  const drawerCloseButtonStyle = {
    position: "absolute",
    top: "12px",
    right: "12px",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "44px",
    height: "44px",
    background: "transparent",
    border: "none",
    borderRadius: "8px",
    color: "#cbd5e1",
    cursor: "pointer",
  };

  const mainContainerStyle = {
    marginLeft: sidebarPushesContent ? "240px" : "0",
    minHeight: "100vh",
    background: "#0f172a",
    transition: motion("margin-left 0.3s ease-in-out"),
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  };

  // The top bar and the session banner stick together as one block, so the top bar never
  // overlaps the banner even if the banner wraps onto several lines on narrow screens.
  const stickyHeaderStyle = {
    position: "sticky",
    top: 0,
    zIndex: 90,
  };

  const topBarStyle = {
    minHeight: "64px",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: isMobile ? "8px" : "16px",
    padding: `0 ${sidePadding}`,
  };

  const toggleButtonStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    minWidth: "44px",
    minHeight: "44px",
    background: "transparent",
    border: "none",
    borderRadius: "8px",
    color: "#60a5fa",
    cursor: "pointer",
    padding: "8px",
    marginLeft: isMobile ? "-10px" : 0,
    transition: "color 0.2s",
  };

  // Not a heading: each page owns its own <h1>. Ellipsis keeps the bar on one line at 375px.
  const titleStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#e2e8f0",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const rightSectionStyle = {
    display: "flex",
    alignItems: "center",
    gap: isMobile ? "12px" : "24px",
    flexShrink: 0,
  };

  // White on #2563eb is 5.2:1 (on the old #3b82f6 it was only 3.7:1, below the 4.5:1 AA minimum).
  const connectWalletButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#2563eb",
    color: "white",
    padding: "10px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: isConnecting ? "not-allowed" : "pointer",
    opacity: isConnecting ? 0.7 : 1,
    transition: "all 0.2s",
    border: "none",
    whiteSpace: "nowrap",
  };

  const connectedWalletButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.3)",
    color: "#10b981",
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  };

  const switchAccountButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "transparent",
    border: "1px solid rgba(96,165,250,0.35)",
    color: "#93c5fd",
    padding: "8px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: isConnecting ? "wait" : "pointer",
    opacity: isConnecting ? 0.6 : 1,
    whiteSpace: "nowrap",
  };

  // Emerald on the #1e293b top bar, matching the connected-wallet button it sits next to.
  const roleBadgeStyle = {
    display: "flex",
    alignItems: "center",
    background: "rgba(16,185,129,0.15)",
    border: "1px solid rgba(16,185,129,0.4)",
    color: "#34d399",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  };

  const contentAreaStyle = {
    flex: 1,
    padding: sidePadding,
    background: "#0f172a",
    // "auto" (not "hidden") so a page that is too wide scrolls instead of being silently clipped.
    overflowX: "auto",
  };

  // Wraps the gate screens shown instead of the app (Login, AccessDenied, ...). It is an in-flow flex
  // child (not an absolutely positioned overlay) so tall content on a short phone screen can't slide
  // under the sticky header.
  const restrictedStyle = {
    flex: 1,
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: `32px ${sidePadding}`,
  };

  const connectLabel = isConnecting ? "Connecting…" : null;
  const sidebarInert = isMobile ? !drawerOpen : !desktopSidebarOpen;

  return (
    <div style={rootStyle}>
      <style>{SHELL_CSS}</style>
      <a href={`#${MAIN_ID}`} className="dfl-skip-link" onClick={handleSkipLinkClick}>
        Skip to main content
      </a>

      {isGranted && (
        <>
          {drawerVisible && <div aria-hidden="true" style={backdropStyle} onClick={() => closeDrawer("toggle")} />}
          <div
            id={SIDEBAR_ID}
            ref={drawerRef}
            style={sidebarWrapperStyle}
            // A collapsed sidebar must not stay reachable with Tab or by screen readers.
            inert={sidebarInert}
            role={drawerVisible ? "dialog" : undefined}
            aria-modal={drawerVisible ? "true" : undefined}
            aria-label={drawerVisible ? "Navigation menu" : undefined}
            tabIndex={drawerVisible ? -1 : undefined}
            onKeyDown={handleDrawerKeyDown}
          >
            {isMobile && (
              <button
                type="button"
                className="dfl-focusable"
                style={drawerCloseButtonStyle}
                onClick={() => closeDrawer("toggle")}
                aria-label="Close navigation menu"
              >
                <X size={20} aria-hidden="true" />
              </button>
            )}
            <Sidebar onNavigate={isMobile ? () => closeDrawer("main") : undefined} />
          </div>
        </>
      )}

      <div style={mainContainerStyle} inert={drawerVisible}>
        <header style={stickyHeaderStyle}>
          <div style={topBarStyle}>
            {isGranted && (
              <button
                ref={toggleRef}
                type="button"
                className="dfl-focusable"
                onClick={handleToggle}
                style={toggleButtonStyle}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#93c5fd")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#60a5fa")}
                title={sidebarExpanded ? "Close sidebar" : "Open sidebar"}
                aria-label="Navigation menu"
                aria-expanded={sidebarExpanded}
                aria-controls={SIDEBAR_ID}
              >
                {sidebarExpanded ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
              </button>
            )}
            <div style={titleStyle}>{isGranted ? pageTitle : isMobile ? "Forensics Locker" : APP_NAME}</div>
            <div style={rightSectionStyle}>
              {isGranted && !isMobile && <Clock />}
              {isGranted && (
                <span style={roleBadgeStyle} data-role={role} title="Your role, read from the evidence contract">
                  <span className="sr-only">Role: </span>
                  {roleLabel}
                </span>
              )}
              {isConnected ? (
                <button
                  type="button"
                  className="dfl-focusable"
                  onClick={disconnect}
                  style={connectedWalletButtonStyle}
                  title="Disconnect (clears this session; your wallet itself is not changed)"
                  aria-label={`Disconnect wallet ${truncateAddress(account)}`}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(16,185,129,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(16,185,129,0.1)";
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#10b981",
                      display: "inline-block",
                    }}
                  ></span>
                  {accountName(account) ? <span style={{ color: "#bae6fd", fontFamily: "inherit" }}>{accountName(account)} ·</span> : null}
                  {truncateAddress(account)}
                </button>
              ) : (
                <button
                  type="button"
                  className="dfl-focusable"
                  onClick={connect}
                  disabled={isConnecting}
                  style={connectWalletButtonStyle}
                  onMouseEnter={(e) => {
                    if (!isConnecting) e.currentTarget.style.background = "#1d4ed8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#2563eb";
                  }}
                >
                  <Wallet size={16} aria-hidden="true" /> {connectLabel ?? (isMobile ? "Connect wallet" : "Connect MetaMask")}
                </button>
              )}
              {isConnected && <AccountSwitcher buttonStyle={switchAccountButtonStyle} compact={isMobile} />}
            </div>
          </div>
          {isGranted ? <SessionBanner /> : null}
        </header>

        {!isConnected ? (
          <main id={MAIN_ID} ref={mainRef} tabIndex={-1} style={restrictedStyle}>
            <Login />
          </main>
        ) : gate === "verifying" ? (
          <main id={MAIN_ID} ref={mainRef} tabIndex={-1} style={restrictedStyle}>
            <Spinner label="Checking your role on the ledger…" />
          </main>
        ) : gate === "denied" ? (
          <main id={MAIN_ID} ref={mainRef} tabIndex={-1} style={restrictedStyle}>
            <AccessDenied />
          </main>
        ) : gate === "unavailable" ? (
          <main id={MAIN_ID} ref={mainRef} tabIndex={-1} style={restrictedStyle}>
            <AccessState />
          </main>
        ) : (
          <main id={MAIN_ID} ref={mainRef} tabIndex={-1} style={contentAreaStyle}>
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
