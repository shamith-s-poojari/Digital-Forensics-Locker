import { useWallet } from "../context/walletContext.js";
import { useContext } from "react";
import { Wallet } from "lucide-react";
import { RoleContext } from "../context/roleContext.js";
import { accountName } from "../web3/accountNames.js";
import { ROLE_LABELS, ROLES } from "../web3/roles.js";

export default function WalletConnect() {
  const { account, connect, disconnect, error, isConnecting } = useWallet();
  // Read directly (not useRole) so the badge still renders, address only, outside a <RoleProvider>.
  const roleState = useContext(RoleContext);

  const truncate = (addr) => (addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "");

  // The display name (VITE_ACCOUNT_NAMES), else the on-chain role, else the shortened address.
  const roleLabel =
    roleState?.status === "ready" && roleState.role && roleState.role !== ROLES.NONE ? ROLE_LABELS[roleState.role] : null;
  const badgeText = accountName(account) ?? roleLabel ?? truncate(account);

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
    fontFamily: badgeText === truncate(account) ? "'JetBrains Mono', monospace" : "inherit",
    cursor: "pointer",
    transition: "all 0.2s",
    fontWeight: 500,
  };

  const disconnectedButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "var(--color-slate-100)",
    color: "var(--color-slate-950)",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 600,
    border: "none",
    cursor: isConnecting ? "not-allowed" : "pointer",
    opacity: isConnecting ? 0.7 : 1,
    transition: "all 0.2s",
    boxShadow: "0 0 16px rgba(var(--ink-rgb), 0.4)",
  };

  if (account) {
    return (
      <button
        type="button"
        onClick={disconnect}
        style={connectedButtonStyle}
        title={`${account}\nDisconnect (clears this session; your wallet itself is not changed)`}
        aria-label={`Disconnect wallet ${badgeText === truncate(account) ? badgeText : `${badgeText} (${truncate(account)})`}`}
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
        {badgeText}
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
          if (!isConnecting) e.currentTarget.style.background = "var(--color-slate-50)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-slate-100)";
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
