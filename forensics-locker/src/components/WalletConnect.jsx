import { useWallet } from "../context/WalletContext";
import { Wallet } from "lucide-react";

export default function WalletConnect() {
  const { account, connect, disconnect } = useWallet();

  const truncate = (addr) => (addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "");

  const connectedButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(16,185,129,0.12)",
    border: "1px solid rgba(16,185,129,0.3)",
    color: "#10b981",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
    transition: "all 0.2s",
    fontWeight: 500,
  };

  const disconnectedButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#3b82f6",
    color: "white",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 0 16px rgba(59,130,246,0.4)",
  };

  return account ? (
    <button
      onClick={disconnect}
      style={connectedButtonStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(16,185,129,0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(16,185,129,0.12)";
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
      {truncate(account)}
    </button>
  ) : (
    <button
      onClick={connect}
      style={disconnectedButtonStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#2563eb";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#3b82f6";
      }}
    >
      <Wallet size={14} /> Connect
    </button>
  );
}
