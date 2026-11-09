import { useState } from "react";
import { NavLink } from "react-router-dom";
import BrandMark from "./BrandMark";
import WalletConnect from "./WalletConnect";
import { useNavLinks } from "./navLinks.js";
import { useAccessRequests } from "../access/accessRequestContext.js";

// Keyboard-only focus ring. var(--color-slate-100) on the var(--color-slate-950) sidebar is about 9.9:1 (WCAG non-text
// contrast needs 3:1). Styles are inline everywhere else, but pseudo-classes can't be inline,
// so this one rule lives in a <style> element and targets a class name.
const FOCUS_CSS = `
.dfl-nav-link:focus-visible {
  outline: 2px solid var(--color-slate-100);
  outline-offset: 2px;
}
`;

/**
 * Main navigation column.
 *
 * @param {object} [props]
 * @param {() => void} [props.onNavigate] Called after a nav link is clicked. Layout passes it on
 *   small screens so the overlay drawer closes once the user has picked a destination.
 */
export default function Sidebar({ onNavigate }) {
  const [hoveredTo, setHoveredTo] = useState(null);
  const links = useNavLinks();
  // Only the Chief sees the Role Management link, so only the Chief sees how many requests are waiting.
  const pendingRequests = useAccessRequests().pending.length;

  const sidebarStyle = {
    // Fills the wrapper Layout gives it (240px on desktop, a drawer on phones).
    width: "100%",
    minWidth: "240px",
    minHeight: "100%",
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
  };

  const logoStyle = {
    marginBottom: "28px",
  };

  const logoTitleStyle = {
    fontSize: "16px",
    fontWeight: 700,
    color: "var(--color-slate-50)",
    marginBottom: "2px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  // var(--color-slate-400) on var(--color-slate-950) is about 7:1 (the old #484f58 was about 2.2:1).
  const logoSubtitleStyle = {
    fontSize: "11px",
    color: "var(--color-slate-400)",
  };

  const navStyle = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  };

  const navLinkStyle = (isActive, isHovered) => {
    const highlighted = !isActive && isHovered;
    return {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      // active links get left-border + extra left padding to compensate
      padding: isActive ? "10px 12px 10px 9px" : "10px 12px",
      borderRadius: "8px",
      textDecoration: "none",
      fontSize: "14px",
      transition: "background 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
      transform: highlighted ? "translateX(2px)" : "none",
      marginBottom: "2px",
      color: isActive ? "var(--color-slate-50)" : highlighted ? "var(--color-slate-100)" : "var(--color-slate-400)",
      fontWeight: isActive ? 700 : 500,
      background: isActive ? "linear-gradient(90deg, rgba(var(--ink-rgb), 0.10), rgba(var(--ink-rgb), 0.02))" : highlighted ? "rgba(var(--surface-rgb), 0.7)" : "transparent",
      borderLeft: isActive ? "3px solid var(--color-slate-50)" : highlighted ? "3px solid var(--color-slate-600)" : "3px solid transparent",
      cursor: "pointer",
    };
  };

  const bottomStyle = {
    borderTop: "1px solid var(--color-slate-700)",
    marginTop: "16px",
    paddingTop: "16px",
  };

  const versionStyle = {
    fontSize: "11px",
    color: "var(--color-slate-400)",
    textAlign: "center",
    marginBottom: "12px",
  };

  return (
    <div style={sidebarStyle}>
      <style>{FOCUS_CSS}</style>

      <div style={logoStyle}>
        <div style={logoTitleStyle}>
          <span aria-hidden="true" className="glass" style={{ display: "inline-flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <BrandMark size={18} />
          </span>
          ForensicsLocker
        </div>
        <div style={logoSubtitleStyle}>Chain of Custody</div>
      </div>

      <nav aria-label="Main" style={navStyle}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className="dfl-nav-link"
            // NavLink sets aria-current="page" on the active link by itself.
            style={({ isActive }) => navLinkStyle(isActive, hoveredTo === to)}
            onClick={onNavigate}
            onMouseEnter={() => setHoveredTo(to)}
            onMouseLeave={() => setHoveredTo((current) => (current === to ? null : current))}
          >
            <Icon size={18} aria-hidden="true" focusable="false" />
            {label}
            {to === "/admin" && pendingRequests > 0 ? (
              <span
                style={{ marginLeft: "auto", minWidth: "20px", padding: "0 6px", borderRadius: "999px", background: "#f59e0b", color: "var(--color-slate-950)", fontSize: "11px", fontWeight: 700, textAlign: "center" }}
              >
                {pendingRequests}
                <span className="sr-only"> pending access requests</span>
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div style={bottomStyle}>
        <div style={versionStyle}>v1.0</div>
        <WalletConnect />
      </div>
    </div>
  );
}
