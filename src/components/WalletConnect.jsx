import { useWallet } from "../context/walletContext.js";
import { Wallet } from "lucide-react";

export default function WalletConnect() {
  const { account, connect, disconnect, error, isConnecting } = useWallet();

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
    background: "#2563eb",
    color: "white",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 600,
    border: "none",
    cursor: isConnecting ? "not-allowed" : "pointer",
    opacity: isConnecting ? 0.7 : 1,
    transition: "all 0.2s",
    boxShadow: "0 0 16px rgba(59,130,246,0.4)",
  };

  if (account) {
    return (
      <button
        type="button"
        onClick={disconnect}
        style={connectedButtonStyle}
        title="Disconnect (clears this session; your wallet itself is not changed)"
        aria-label={`Disconnect wallet ${truncate(account)}`}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(16,185,129,0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(16,185,129,0.12)";
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
        {truncate(account)}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={connect}
        disabled={isConnecting}
        style={disconnectedButtonStyle}
        onMouseEnter={(e) => {
          if (!isConnecting) e.currentTarget.style.background = "#1d4ed8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#2563eb";
        }}
      >
        <Wallet size={14} aria-hidden="true" /> {isConnecting ? "Connecting…" : "Connect"}
      </button>
      {error && (
        <div role="alert" style={{ marginTop: "8px", fontSize: "12px", color: "#f87171", lineHeight: 1.4 }}>
          {error}
        </div>
      )}
    </>
  );
}
