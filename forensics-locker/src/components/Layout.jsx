import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Menu, X, Wallet, Lock } from "lucide-react";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  const [time, setTime] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress] = useState("0x71C7656EC7ab88b098defB751B7401B5f6d8976F");
  const location = useLocation();

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleConnectWallet = () => {
    setIsConnected(true);
  };

  const handleDisconnectWallet = () => {
    setIsConnected(false);
  };

  const getPageTitle = () => {
    const titles = {
      "/": "Dashboard",
      "/upload": "Evidence Upload",
      "/evidence": "Evidence Viewer",
      "/custody": "Chain of Custody",
      "/cases": "Case Management",
    };
    return titles[location.pathname] || "Dashboard";
  };

  const formatTime = (date) => {
    const options = {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    return date.toLocaleString("en-US", options);
  };

  const truncateAddress = (addr) => (addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "");

  const sidebarWrapperStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    height: "100vh",
    width: isConnected && sidebarOpen ? "240px" : "0",
    zIndex: 100,
    transition: "width 0.3s ease-in-out",
    overflow: "hidden",
    backgroundColor: "#0f172a",
    borderRight: "1px solid #334155",
  };

  const topBarStyle = {
    height: "64px",
    background: "#1e293b",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 32px",
    position: "sticky",
    top: 0,
    zIndex: 90,
    marginLeft: isConnected && sidebarOpen ? "0" : "0",
    transition: "margin-left 0.3s ease-in-out",
  };

  const toggleButtonStyle = {
    display: isConnected ? "flex" : "none",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: "#60a5fa",
    cursor: "pointer",
    padding: "8px",
    marginRight: "16px",
    transition: "color 0.2s",
  };

  const titleStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#e2e8f0",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: 1,
  };

  const rightSectionStyle = {
    display: "flex",
    alignItems: "center",
    gap: "24px",
  };

  const clockStyle = {
    fontSize: "12px",
    color: "#94a3b8",
    fontFamily: "'JetBrains Mono', monospace",
  };

  const connectWalletButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#3b82f6",
    color: "white",
    padding: "10px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
    border: "none",
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
  };

  const mainContainerStyle = {
    marginLeft: isConnected && sidebarOpen ? "240px" : "0",
    minHeight: "100vh",
    background: "#0f172a",
    transition: "margin-left 0.3s ease-in-out",
    width: "100%",
    display: "flex",
    flexDirection: "column",
  };

  const contentAreaStyle = {
    flex: 1,
    padding: "32px",
    background: "#0f172a",
    overflowX: "hidden",
    overflowY: "auto",
  };

  const restrictedOverlayStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "24px",
    zIndex: 50,
    width: "100%",
    height: "100%",
  };

  const restrictedContentStyle = {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
  };

  const restrictedTitleStyle = {
    fontSize: "24px",
    fontWeight: 700,
    color: "#e2e8f0",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  };

  const restrictedMessageStyle = {
    fontSize: "16px",
    color: "#cbd5e1",
    maxWidth: "500px",
    lineHeight: "1.6",
  };

  return (
    <div style={{ display: "flex", width: "100%", minHeight: "100vh", background: "#0f172a", position: "relative" }}>
      {isConnected && (
        <div style={sidebarWrapperStyle}>
          <Sidebar />
        </div>
      )}
      <div style={mainContainerStyle}>
        <div style={topBarStyle}>
          {isConnected && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={toggleButtonStyle}
              onMouseEnter={(e) => e.target.style.color = "#1d4ed8"}
              onMouseLeave={(e) => e.target.style.color = "#60a5fa"}
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
          <div style={titleStyle}>{isConnected ? getPageTitle() : "Digital Forensics Locker"}</div>
          <div style={rightSectionStyle}>
            {isConnected && <div style={clockStyle}>{formatTime(time)}</div>}
            {isConnected ? (
              <button
                onClick={handleDisconnectWallet}
                style={connectedWalletButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(16,185,129,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(16,185,129,0.1)";
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "#10b981",
                    display: "inline-block",
                  }}
                ></span>
                {truncateAddress(walletAddress)}
              </button>
            ) : (
              <button
                onClick={handleConnectWallet}
                style={connectWalletButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#2563eb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#3b82f6";
                }}
              >
                <Wallet size={16} /> Connect MetaMask
              </button>
            )}
          </div>
        </div>

        {!isConnected ? (
          <div style={restrictedOverlayStyle}>
            <div style={restrictedContentStyle}>
              <Lock size={48} color="#60a5fa" strokeWidth={1.5} />
              <div style={restrictedTitleStyle}>
                Access Restricted
              </div>
              <div style={restrictedMessageStyle}>
                Please connect your authorized officer wallet to access the forensics locker. This decentralized evidence management system requires MetaMask authentication for secure chain-of-custody verification.
              </div>
              <button
                onClick={handleConnectWallet}
                style={{
                  ...connectWalletButtonStyle,
                  padding: "12px 24px",
                  fontSize: "14px",
                  marginTop: "16px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#2563eb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#3b82f6";
                }}
              >
                <Wallet size={18} /> Connect Wallet to Proceed
              </button>
            </div>
          </div>
        ) : (
          <div style={contentAreaStyle}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
