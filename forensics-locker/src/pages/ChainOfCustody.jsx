import { useState } from "react";
import { Copy, CheckCircle2 } from "lucide-react";
import { mockCustodyLog } from "../data/mockData";

export default function ChainOfCustody() {
  const [auditLogs, setAuditLogs] = useState(mockCustodyLog);
  const [cidFilter, setCidFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("All");
  const [copiedHash, setCopiedHash] = useState(null);

  const filteredLogs = auditLogs.filter((log) => {
    const matchesCID = log.cidHash.toLowerCase().includes(cidFilter.toLowerCase());
    const matchesEventType = eventTypeFilter === "All" || log.eventType === eventTypeFilter;
    return matchesCID && matchesEventType;
  });

  const handleCopyHash = (hash) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const getEventTypeColor = (eventType) => {
    switch (eventType) {
      case "Submit":
        return { bg: "bg-emerald-900/30", border: "border-emerald-700/50", text: "text-emerald-300", badge: "bg-emerald-500/20 text-emerald-300" };
      case "Access":
        return { bg: "bg-blue-900/30", border: "border-blue-700/50", text: "text-blue-300", badge: "bg-blue-500/20 text-blue-300" };
      case "Verify":
        return { bg: "bg-amber-900/30", border: "border-amber-700/50", text: "text-amber-300", badge: "bg-amber-500/20 text-amber-300" };
      default:
        return { bg: "bg-slate-800/30", border: "border-slate-700/50", text: "text-slate-300", badge: "bg-slate-500/20 text-slate-300" };
    }
  };

  const pageStyle = {
    padding: "0",
    background: "#0a0d12",
    minHeight: "100%",
  };

  const headerStyle = {
    padding: "32px 32px 24px",
    background: "linear-gradient(to bottom, rgba(15,20,25,0.5), rgba(15,20,25,0))",
    borderBottom: "1px solid rgba(100,116,139,0.2)",
    marginBottom: "32px",
  };

  const titleStyle = {
    fontSize: "28px",
    fontWeight: 700,
    color: "#e2e8f0",
    marginBottom: "8px",
  };

  const subtitleStyle = {
    fontSize: "14px",
    color: "#94a3b8",
    marginBottom: "24px",
  };

  const statsContainerStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px",
    marginBottom: "32px",
  };

  const statCardStyle = {
    padding: "16px",
    background: "rgba(30,41,59,0.4)",
    border: "1px solid rgba(100,116,139,0.2)",
    borderRadius: "8px",
  };

  const statLabelStyle = {
    fontSize: "12px",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 600,
    marginBottom: "8px",
  };

  const statValueStyle = {
    fontSize: "24px",
    fontWeight: 700,
    color: "#e2e8f0",
  };

  const controlsContainerStyle = {
    padding: "0 32px",
    marginBottom: "32px",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  };

  const inputStyle = {
    padding: "10px 14px",
    background: "rgba(30,41,59,0.4)",
    border: "1px solid rgba(100,116,139,0.3)",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    transition: "all 0.2s",
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
  };

  const tableContainerStyle = {
    padding: "0 32px",
    background: "#0a0d12",
    borderRadius: "0",
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: "32px",
  };

  const tableHeaderCellStyle = {
    padding: "14px 12px",
    textAlign: "left",
    fontSize: "11px",
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "rgba(30,41,59,0.5)",
    borderBottom: "1px solid rgba(100,116,139,0.2)",
    borderTop: "1px solid rgba(100,116,139,0.2)",
  };

  const tableRowStyle = {
    borderBottom: "1px solid rgba(100,116,139,0.15)",
    transition: "background 0.15s",
  };

  const tableRowHoverStyle = {
    background: "rgba(30,41,59,0.3)",
  };

  const tableCellStyle = {
    padding: "14px 12px",
    fontSize: "13px",
    color: "#cbd5e1",
    fontFamily: "'JetBrains Mono', monospace",
  };

  const eventBadgeStyle = (eventType) => {
    const colors = getEventTypeColor(eventType);
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      background: colors.badge,
      color: colors.text,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    };
  };

  const cidCellStyle = {
    ...tableCellStyle,
    color: "#60a5fa",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
    maxWidth: "250px",
    wordBreak: "break-all",
  };

  const txHashCellStyle = {
    ...tableCellStyle,
    color: "#94a3b8",
    fontSize: "11px",
    fontFamily: "'JetBrains Mono', monospace",
    maxWidth: "180px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const copyButtonStyle = {
    background: "transparent",
    border: "none",
    color: "#60a5fa",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  };

  const truncateHash = (hash, length = 12) => hash.slice(0, length) + "...";
  const truncateAddress = (addr) => addr.slice(0, 6) + "..." + addr.slice(-4);

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>Chain of Custody Audit Log</div>
        <div style={subtitleStyle}>Immutable Ethereum blockchain record of all evidence handling events</div>
      </div>

      <div style={{ padding: "0 32px" }}>
        <div style={statsContainerStyle}>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Total Events</div>
            <div style={statValueStyle}>{auditLogs.length}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Verified Events</div>
            <div style={statValueStyle}>{auditLogs.filter(log => log.eventType === "Verify").length}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Unique CIDs</div>
            <div style={statValueStyle}>{new Set(auditLogs.map(log => log.cidHash)).size}</div>
          </div>
        </div>
      </div>

      <div style={controlsContainerStyle}>
        <div>
          <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px", fontWeight: 600 }}>
            Filter by IPFS CID
          </label>
          <input
            type="text"
            placeholder="Qm... or bafy..."
            value={cidFilter}
            onChange={(e) => setCidFilter(e.target.value)}
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "rgba(100,116,139,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(100,116,139,0.3)")}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px", fontWeight: 600 }}>
            Event Type
          </label>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            style={selectStyle}
            onFocus={(e) => (e.target.style.borderColor = "rgba(100,116,139,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(100,116,139,0.3)")}
          >
            <option>All</option>
            <option>Submit</option>
            <option>Access</option>
            <option>Verify</option>
          </select>
        </div>
      </div>

      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableHeaderCellStyle}>Event Type</th>
              <th style={tableHeaderCellStyle}>IPFS CID</th>
              <th style={tableHeaderCellStyle}>Officer (Address)</th>
              <th style={tableHeaderCellStyle}>Timestamp</th>
              <th style={tableHeaderCellStyle}>Transaction Hash</th>
              <th style={tableHeaderCellStyle}>Block</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr
                key={log.id}
                style={tableRowStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = tableRowHoverStyle.background)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={tableCellStyle}>
                  <span style={eventBadgeStyle(log.eventType)}>{log.eventType}</span>
                </td>
                <td style={cidCellStyle} title={log.cidHash}>
                  {truncateHash(log.cidHash, 16)}
                </td>
                <td style={tableCellStyle}>{truncateAddress(log.actor)}</td>
                <td style={tableCellStyle}>{log.timestamp}</td>
                <td style={txHashCellStyle}>
                  <span>{truncateHash(log.txHash, 10)}</span>
                  <button
                    style={copyButtonStyle}
                    onClick={() => handleCopyHash(log.txHash)}
                    title="Copy transaction hash"
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#bfdbfe")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#60a5fa")}
                  >
                    {copiedHash === log.txHash ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </td>
                <td style={tableCellStyle}>{log.blockNumber.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredLogs.length === 0 && (
        <div style={{ padding: "48px 32px", textAlign: "center" }}>
          <div style={{ color: "#94a3b8", fontSize: "14px" }}>No events match your filters</div>
        </div>
      )}
    </div>
  );
}
