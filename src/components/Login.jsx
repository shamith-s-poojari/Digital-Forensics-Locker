import { Lock, Wallet } from "lucide-react";
import { useAuth } from "../context/authContext.js";

const contentStyle = {
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "16px",
};

const titleStyle = {
  fontSize: "24px",
  fontWeight: 700,
  color: "#e2e8f0",
};

const messageStyle = {
  fontSize: "16px",
  color: "#cbd5e1",
  maxWidth: "500px",
  lineHeight: "1.6",
};

const walletMessageStyle = {
  maxWidth: "500px",
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: "6px",
  padding: "10px 14px",
  color: "#fca5a5",
  fontSize: "14px",
  lineHeight: 1.5,
};

/**
 * The gateway shown while no wallet is connected (gate "signed-out"). Connecting only proves which address this is;
 * the role is then read from the contract by RoleProvider, and Layout moves on to the app or to the access request
 * screen. Nothing here lets the user choose a role.
 *
 * Must be inside <AuthProvider>.
 */
export default function Login() {
  const { connect, isConnecting, error, notice } = useAuth();

  // White on #2563eb is 5.2:1, above the 4.5:1 AA minimum.
  const buttonStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#2563eb",
    color: "white",
    padding: "12px 24px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: isConnecting ? "not-allowed" : "pointer",
    opacity: isConnecting ? 0.7 : 1,
    transition: "all 0.2s",
    border: "none",
    whiteSpace: "nowrap",
    marginTop: "16px",
  };

  return (
    <div style={contentStyle}>
      <Lock size={48} color="#60a5fa" strokeWidth={1.5} aria-hidden="true" />
      <h1 style={titleStyle}>Wallet Required</h1>
      <p style={messageStyle}>
        Connect your MetaMask wallet to continue. Connecting a wallet is not authorization: what you may see and do is
        decided by the roles your wallet holds on the ledger.
      </p>
      {notice && !error && (
        <div role="status" style={walletMessageStyle}>
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" style={walletMessageStyle}>
          {error}
        </div>
      )}
      <button
        type="button"
        className="dfl-focusable"
        onClick={connect}
        disabled={isConnecting}
        style={buttonStyle}
        onMouseEnter={(e) => {
          if (!isConnecting) e.currentTarget.style.background = "#1d4ed8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#2563eb";
        }}
      >
        <Wallet size={18} aria-hidden="true" /> {isConnecting ? "Connecting…" : "Connect Wallet to Proceed"}
      </button>
    </div>
  );
}
