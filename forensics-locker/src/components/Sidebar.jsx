import { NavLink } from "react-router-dom";
import { LayoutDashboard, Upload, Search, GitBranch, FolderOpen } from "lucide-react";
import WalletConnect from "./WalletConnect";

export default function Sidebar() {
  const sidebarStyle = {
    width: "240px",
    minHeight: "100vh",
    background: "#0a0d16",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
    position: "relative",
    top: 0,
    left: 0,
    zIndex: 100,
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

  const logoSubtitleStyle = {
    fontSize: "11px",
    color: "#484f58",
  };

  const navStyle = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  };

  const navLinkStyle = (isActive) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: isActive ? "10px 12px 10px 9px" : "10px 12px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 500,
    transition: "all 0.2s",
    marginBottom: "2px",
    color: isActive ? "#3b82f6" : "#8b949e",
    background: isActive ? "rgba(59,130,246,0.12)" : "transparent",
    borderLeft: isActive ? "3px solid #3b82f6" : "none",
    cursor: "pointer",
  });

  const navLinkHoverStyle = {
    background: "rgba(255,255,255,0.04)",
    color: "#f0f6fc",
  };

  const bottomStyle = {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    marginTop: "16px",
    paddingTop: "16px",
  };

  const versionStyle = {
    fontSize: "11px",
    color: "#484f58",
    textAlign: "center",
    marginBottom: "12px",
  };

  const links = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/upload", icon: Upload, label: "Evidence Upload" },
    { to: "/evidence", icon: Search, label: "Evidence Viewer" },
    { to: "/custody", icon: GitBranch, label: "Chain of Custody" },
    { to: "/cases", icon: FolderOpen, label: "Case Management" },
  ];

  return (
    <div style={sidebarStyle}>
      <div style={logoStyle}>
        <div style={logoTitleStyle}>
          <span style={{ fontSize: "20px" }}>🔐</span>
          ForensicsLocker
        </div>
        <div style={logoSubtitleStyle}>Chain of Custody</div>
      </div>

      <nav style={navStyle}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            style={({ isActive }) => ({
              ...navLinkStyle(isActive),
              ...(isActive ? {} : navLinkHoverStyle),
            })}
            onMouseEnter={(e) => {
              if (e.currentTarget.style.borderLeft !== "3px solid #3b82f6") {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.color = "#f0f6fc";
              }
            }}
            onMouseLeave={(e) => {
              if (e.currentTarget.style.borderLeft !== "3px solid #3b82f6") {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#8b949e";
              }
            }}
          >
            <link.icon size={18} />
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div style={bottomStyle}>
        <div style={versionStyle}>v1.0 · Sepolia</div>
        <WalletConnect />
      </div>
    </div>
  );
}
