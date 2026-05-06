import { useState } from "react";
import { Copy, Check, CheckCircle2 } from "lucide-react";
import { mockCustodyLog } from "../data/mockData";

export default function ChainOfCustody() {
  const [auditLogs, setAuditLogs] = useState(mockCustodyLog);
  const [cidFilter, setCidFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("All");
  const [copiedHash, setCopiedHash] = useState(null); // kept for tx-hash cell
  const [copiedId, setCopiedId]     = useState(null); // e.g. "cid:log001" or "addr:log001"
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const filteredLogs = auditLogs.filter((log) => {
    const matchesCID = log.cidHash.toLowerCase().includes(cidFilter.toLowerCase());
    const matchesEventType = eventTypeFilter === "All" || log.eventType === eventTypeFilter;
    return matchesCID && matchesEventType;
  });

  // ── Pagination ───────────────────────────────────────────────────────────────
  const totalItems    = filteredLogs.length;
  const totalPages    = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage      = Math.min(currentPage, totalPages);
  const pageStart     = (safePage - 1) * ITEMS_PER_PAGE;
  const pagedLogs     = filteredLogs.slice(pageStart, pageStart + ITEMS_PER_PAGE);
  const showingFrom   = totalItems === 0 ? 0 : pageStart + 1;
  const showingTo     = Math.min(pageStart + ITEMS_PER_PAGE, totalItems);

  const handleCopyHash = (hash) => {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Generic copy with keyed confirmation (for CID, address)
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getEventTypeColor = (eventType) => {
    const map = {
      Submit:  { bg: "rgba(34,197,94,0.1)",  dot: "#22c55e", text: "#22c55e", border: "rgba(34,197,94,0.3)"  },
      Access:  { bg: "rgba(59,130,246,0.1)",  dot: "#3b82f6", text: "#3b82f6", border: "rgba(59,130,246,0.3)"  },
      Verify:  { bg: "rgba(234,179,8,0.1)",   dot: "#eab308", text: "#eab308", border: "rgba(234,179,8,0.3)"   },
    };
    return map[eventType] || { bg: "rgba(100,116,139,0.1)", dot: "#64748b", text: "#64748b", border: "rgba(100,116,139,0.3)" };
  };

  const pageStyle = {
    padding: "0",
    background: "#0f172a",
    minHeight: "100%",
  };

  const headerStyle = {
    padding: "32px 32px 24px",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
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
    background: "#1e293b",
    border: "1px solid #334155",
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
    background: "#1e293b",
    border: "1px solid #475569",
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
    background: "#0f172a",
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
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    borderTop: "1px solid #334155",
  };

  const tableRowStyle = {
    borderBottom: "1px solid #334155",
    transition: "background 0.15s",
  };

  const tableRowHoverStyle = {
    background: "rgba(59,130,246,0.05)",
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
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      padding: "3px 10px",
      borderRadius: "20px",
      fontSize: "11px",
      fontWeight: 600,
      backgroundColor: colors.bg,
      color: colors.text,
      border: `1px solid ${colors.border}`,
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
            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
            onBlur={(e) => (e.target.style.borderColor = "#475569")}
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
            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
            onBlur={(e) => (e.target.style.borderColor = "#475569")}
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
            {pagedLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: "#64748b", fontSize: 14 }}>No events match your filters</td>
              </tr>
            ) : pagedLogs.map((log) => (
              <tr
                key={log.id}
                style={tableRowStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = tableRowHoverStyle.background)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={tableCellStyle}>
                  <span style={eventBadgeStyle(log.eventType)}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: getEventTypeColor(log.eventType).dot, flexShrink: 0 }} />
                    {log.eventType}
                  </span>
                </td>
                <td style={cidCellStyle} title={log.cidHash}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span>{truncateHash(log.cidHash, 16)}</span>
                    <button
                      onClick={() => handleCopy(log.cidHash, `cid:${log.id}`)}
                      title="Copy full CID"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: copiedId === `cid:${log.id}` ? "#22c55e" : "#60a5fa", transition: "color 0.15s", display: "flex", alignItems: "center" }}
                      onMouseEnter={(e) => { if (copiedId !== `cid:${log.id}`) e.currentTarget.style.color = "#bfdbfe"; }}
                      onMouseLeave={(e) => { if (copiedId !== `cid:${log.id}`) e.currentTarget.style.color = "#60a5fa"; }}
                    >
                      {copiedId === `cid:${log.id}` ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </span>
                </td>
                <td style={{ ...tableCellStyle, fontFamily: "'JetBrains Mono', monospace" }} title={log.actor}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span>{truncateAddress(log.actor)}</span>
                    <button
                      onClick={() => handleCopy(log.actor, `addr:${log.id}`)}
                      title="Copy full wallet address"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: copiedId === `addr:${log.id}` ? "#22c55e" : "#64748b", transition: "color 0.15s", display: "flex", alignItems: "center" }}
                      onMouseEnter={(e) => { if (copiedId !== `addr:${log.id}`) e.currentTarget.style.color = "#94a3b8"; }}
                      onMouseLeave={(e) => { if (copiedId !== `addr:${log.id}`) e.currentTarget.style.color = "#64748b"; }}
                    >
                      {copiedId === `addr:${log.id}` ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </span>
                </td>
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
      {/* ── Pagination Footer ── */}
      <div style={{ padding: "0 32px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "0 0 8px 8px", marginTop: "-1px" }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {totalItems === 0 ? "No results" : `Showing ${showingFrom}–${showingTo} of ${totalItems} entries`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: safePage <= 1 ? "not-allowed" : "pointer", backgroundColor: "#0f172a", color: safePage <= 1 ? "#475569" : "#94a3b8", border: "1px solid #334155", opacity: safePage <= 1 ? 0.45 : 1, transition: "all 0.15s" }}
              onMouseEnter={(e) => { if (safePage > 1) { e.currentTarget.style.backgroundColor = "#334155"; e.currentTarget.style.color = "#f1f5f9"; } }}
              onMouseLeave={(e) => { if (safePage > 1) { e.currentTarget.style.backgroundColor = "#0f172a"; e.currentTarget.style.color = "#94a3b8"; } }}
            >← Previous</button>
            <span style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, color: "#94a3b8", backgroundColor: "#0f172a", border: "1px solid #334155" }}>
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: safePage >= totalPages ? "not-allowed" : "pointer", backgroundColor: "#0f172a", color: safePage >= totalPages ? "#475569" : "#94a3b8", border: "1px solid #334155", opacity: safePage >= totalPages ? 0.45 : 1, transition: "all 0.15s" }}
              onMouseEnter={(e) => { if (safePage < totalPages) { e.currentTarget.style.backgroundColor = "#334155"; e.currentTarget.style.color = "#f1f5f9"; } }}
              onMouseLeave={(e) => { if (safePage < totalPages) { e.currentTarget.style.backgroundColor = "#0f172a"; e.currentTarget.style.color = "#94a3b8"; } }}
            >Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
