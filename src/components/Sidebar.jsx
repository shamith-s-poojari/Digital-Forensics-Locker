import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Lock } from "lucide-react";
import WalletConnect from "./WalletConnect";
import { useNavLinks } from "./navLinks.js";

// Keyboard-only focus ring. #93c5fd on the #0f172a sidebar is about 9.9:1 (WCAG non-text
// contrast needs 3:1). Styles are inline everywhere else, but pseudo-classes can't be inline,
// so this one rule lives in a <style> element and targets a class name.
const FOCUS_CSS = `
.dfl-nav-link:focus-visible {
  outline: 2px solid #93c5fd;
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

  const sidebarStyle = {
    // Fills the wrapper Layout gives it (240px on desktop, a drawer on phones).
    width: "100%",
    minWidth: "240px",
    minHeight: "100%",
    background: "#0f172a",
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
    color: "#f0f6fc",
    marginBottom: "2px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  // #94a3b8 on #0f172a is about 7:1 (the old #484f58 was about 2.2:1).
  const logoSubtitleStyle = {
    fontSize: "11px",
    color: "#94a3b8",
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
      transition: "background 0.15s, color 0.15s",
      marginBottom: "2px",
      color: isActive ? "#ffffff" : highlighted ? "#f1f5f9" : "#94a3b8",
      fontWeight: isActive ? 700 : 500,
      background: isActive ? "rgba(59,130,246,0.18)" : highlighted ? "rgba(51,65,85,0.7)" : "transparent",
      borderLeft: isActive ? "3px solid #3b82f6" : highlighted ? "3px solid #475569" : "3px solid transparent",
      cursor: "pointer",
    };
  };

  const bottomStyle = {
    borderTop: "1px solid #334155",
    marginTop: "16px",
    paddingTop: "16px",
  };

  const versionStyle = {
    fontSize: "11px",
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: "12px",
  };

  return (
    <div style={sidebarStyle}>
      <style>{FOCUS_CSS}</style>

      <div style={logoStyle}>
        <div style={logoTitleStyle}>
          <Lock size={20} color="#60a5fa" aria-hidden="true" focusable="false" />
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
          </NavLink>
        ))}
      </nav>

      <div style={bottomStyle}>
        <div style={versionStyle}>v1.0 · Pre-release</div>
        <WalletConnect />
      </div>
    </div>
  );
}
