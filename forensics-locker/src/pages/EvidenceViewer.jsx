import { useState } from "react";
import { X, Copy, Check, CheckCircle, AlertCircle, Search, ShieldCheck } from "lucide-react";
import { mockEvidence, mockCases, mockCustodyLog } from "../data/mockData";
import { computeSHA256 } from "../utils/hash";
import { exportCustodyReport } from "../utils/pdf";

// ── Design tokens (mirrors CaseManagement) ────────────────────────────────────
const T = {
  pageBg:    "#0f172a",
  cardBg:    "#1e293b",
  tableBg:   "#0f172a",
  border:    "#334155",
  inputBorder: "#475569",
  textHigh:  "#f1f5f9",
  textMid:   "#e2e8f0",
  textLow:   "#94a3b8",
  textMuted: "#64748b",
  blue:      "#3b82f6",
  blueDark:  "#2563eb",
};

// ── Status pill config (Verified / Pending / Flagged) ─────────────────────────
const STATUS_STYLE = {
  Verified: { bg: "rgba(34,197,94,0.1)",   color: "#22c55e", border: "rgba(34,197,94,0.3)"  },
  Pending:  { bg: "rgba(234,179,8,0.1)",   color: "#eab308", border: "rgba(234,179,8,0.3)"  },
  Flagged:  { bg: "rgba(239,68,68,0.1)",   color: "#ef4444", border: "rgba(239,68,68,0.3)"  },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || { bg: "rgba(100,116,139,0.1)", color: T.textMuted, border: "rgba(100,116,139,0.3)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      backgroundColor: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      padding: "3px 10px", borderRadius: "20px",
      fontSize: "11px", fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: s.color, flexShrink: 0 }} />
      {status}
    </span>
  );
}

// ── Reusable label/value pair ─────────────────────────────────────────────────
function MetaRow({ label, children }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600, marginBottom: 4 }}>{label}</p>
      {children}
    </div>
  );
}

export default function EvidenceViewer() {
  const [searchTerm, setSearchTerm]         = useState("");
  const [statusFilter, setStatusFilter]     = useState("All");
  const [typeFilter, setTypeFilter]         = useState("All");
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [copiedHash, setCopiedHash]         = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying]       = useState(false);
  const [hoveredRow, setHoveredRow]         = useState(null);
  const [currentPage, setCurrentPage]       = useState(1);
  const [copiedId, setCopiedId]             = useState(null); // e.g. "cid:ev001" or "hash:ev001"
  const ITEMS_PER_PAGE = 10;

  // One-click copy with 2-second checkmark confirmation
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filteredEvidence = mockEvidence.filter((ev) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      ev.fileName.toLowerCase().includes(q) ||
      ev.caseId.toLowerCase().includes(q) ||
      ev.id.toLowerCase().includes(q) ||
      ev.submittedBy.toLowerCase().includes(q);
    return matchesSearch
      && (statusFilter === "All" || ev.status === statusFilter)
      && (typeFilter   === "All" || ev.fileType === typeFilter);
  });

  // ── Pagination derived vars ──────────────────────────────────────────────────
  const totalItems    = filteredEvidence.length;
  const totalPages    = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage      = Math.min(currentPage, totalPages);
  const pageStart     = (safePage - 1) * ITEMS_PER_PAGE;
  const pagedEvidence = filteredEvidence.slice(pageStart, pageStart + ITEMS_PER_PAGE);
  const showingFrom   = totalItems === 0 ? 0 : pageStart + 1;
  const showingTo     = Math.min(pageStart + ITEMS_PER_PAGE, totalItems);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleCopyHash = () => {
    if (selectedEvidence) {
      navigator.clipboard.writeText(selectedEvidence.hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const handleVerify = async (file) => {
    setIsVerifying(true);
    try {
      const computedHash = await computeSHA256(file);
      setVerificationResult({ matches: computedHash === selectedEvidence.hash, computedHash, storedHash: selectedEvidence.hash });
    } catch (err) { console.error("Verification failed:", err); }
    setIsVerifying(false);
  };

  const handleVerifyFile = (e) => { const f = e.target.files?.[0]; if (f) handleVerify(f); };

  const handleExportPDF = () => {
    const caseData = mockCases.find((c) => c.id === selectedEvidence.caseId);
    const caseEvidence = mockEvidence.filter((e) => e.caseId === selectedEvidence.caseId);
    if (caseData) exportCustodyReport(caseData, caseEvidence, mockCustodyLog);
  };

  // ── Shared inline styles ────────────────────────────────────────────────────
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    backgroundColor: T.cardBg, border: `1px solid ${T.inputBorder}`,
    borderRadius: 8, color: T.textHigh, fontSize: 14, outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const primaryBtn = {
    flex: 1, backgroundColor: T.blueDark, color: "#fff",
    padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    border: "none", cursor: "pointer", transition: "background-color 0.2s",
  };

  const ghostBtn = {
    flex: 1, backgroundColor: "transparent", color: T.textLow,
    padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    border: `1px solid ${T.inputBorder}`, cursor: "pointer", transition: "all 0.2s",
  };

  const thStyle = {
    textAlign: "left", padding: "12px 16px",
    fontSize: 11, fontWeight: 600, color: T.textMuted,
    textTransform: "uppercase", letterSpacing: "0.5px",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ backgroundColor: T.pageBg, minHeight: "100vh", padding: 32 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.textHigh }}>Evidence Viewer</h1>
        <div style={{ backgroundColor: T.cardBg, color: T.textLow, padding: "4px 12px", borderRadius: 20, fontSize: 13, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.5px", fontSize: 11, fontWeight: 600 }}>Records</span>
          <span style={{ fontWeight: 700 }}>{filteredEvidence.length}</span>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textMuted, pointerEvents: "none" }} />
        <input
          type="text"
          placeholder="Search by file name, case ID, evidence ID, or officer…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ ...inputStyle, padding: "10px 16px 10px 40px" }}
          onFocus={(e) => { e.target.style.borderColor = T.blue; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)"; }}
          onBlur={(e)  => { e.target.style.borderColor = T.inputBorder; e.target.style.boxShadow = "none"; }}
        />
      </div>

      {/* ── Filter tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {/* Status filters */}
        {[
          { label: "All",      dot: T.blue },
          { label: "Verified", dot: "#22c55e" },
          { label: "Pending",  dot: "#eab308" },
          { label: "Flagged",  dot: "#ef4444" },
        ].map(({ label, dot }) => {
          const active = statusFilter === label;
          return (
            <button key={label} onClick={() => setStatusFilter(label)}
              style={{ padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", border: active ? `1px solid ${T.blue}` : `1px solid ${T.border}`, backgroundColor: active ? T.blueDark : T.cardBg, color: active ? "#fff" : T.textLow, transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6 }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.backgroundColor = "#334155"; e.currentTarget.style.color = "#cbd5e1"; } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.backgroundColor = T.cardBg;  e.currentTarget.style.color = T.textLow; } }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: dot }} />
              {label}
            </button>
          );
        })}

        <div style={{ width: 1, backgroundColor: T.border, margin: "0 4px" }} />

        {/* Type filters */}
        {["All Types", "Digital Image", "Video", "Document", "Device Log"].map((t) => {
          const val = t === "All Types" ? "All" : t;
          const active = typeFilter === val;
          return (
            <button key={t} onClick={() => setTypeFilter(val)}
              style={{ padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", border: active ? `1px solid ${T.blue}` : `1px solid ${T.border}`, backgroundColor: active ? T.blueDark : T.cardBg, color: active ? "#fff" : T.textLow, transition: "all 0.2s" }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.backgroundColor = "#334155"; e.currentTarget.style.color = "#cbd5e1"; } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.backgroundColor = T.cardBg;  e.currentTarget.style.color = T.textLow; } }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", backgroundColor: T.tableBg }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: T.cardBg }}>
                {["IPFS CID", "Case ID", "File Name", "Type", "SHA-256", "Internal ID", "Status", "Actions"].map((col) => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedEvidence.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "48px 16px", textAlign: "center", color: T.textMuted, fontSize: 14 }}>
                    No evidence records match your filters.
                  </td>
                </tr>
              ) : pagedEvidence.map((ev) => (
                <tr key={ev.id}
                  style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: hoveredRow === ev.id ? "rgba(59,130,246,0.05)" : "transparent", transition: "background-color 0.15s" }}
                  onMouseEnter={() => setHoveredRow(ev.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", color: T.blue, fontSize: 12, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span title={ev.cid}>{ev.cid.slice(0, 16)}…</span>
                      <button
                        onClick={() => handleCopy(ev.cid, `cid:${ev.id}`)}
                        title="Copy full CID"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: copiedId === `cid:${ev.id}` ? "#22c55e" : T.textMuted, transition: "color 0.15s", display: "flex", alignItems: "center" }}
                        onMouseEnter={(e) => { if (copiedId !== `cid:${ev.id}`) e.currentTarget.style.color = T.blue; }}
                        onMouseLeave={(e) => { if (copiedId !== `cid:${ev.id}`) e.currentTarget.style.color = T.textMuted; }}
                      >
                        {copiedId === `cid:${ev.id}` ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", color: T.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>
                    {ev.caseId}
                  </td>
                  <td style={{ padding: "12px 16px", color: T.textMid, fontSize: 13, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={ev.fileName}>
                    {ev.fileName}
                  </td>
                  <td style={{ padding: "12px 16px", color: T.textLow, fontSize: 12, whiteSpace: "nowrap" }}>{ev.fileType}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", color: T.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span title={ev.hash}>{ev.hash.slice(0, 12)}…</span>
                      <button
                        onClick={() => handleCopy(ev.hash, `hash:${ev.id}`)}
                        title="Copy full SHA-256 hash"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: copiedId === `hash:${ev.id}` ? "#22c55e" : T.textMuted, transition: "color 0.15s", display: "flex", alignItems: "center" }}
                        onMouseEnter={(e) => { if (copiedId !== `hash:${ev.id}`) e.currentTarget.style.color = "#94a3b8"; }}
                        onMouseLeave={(e) => { if (copiedId !== `hash:${ev.id}`) e.currentTarget.style.color = T.textMuted; }}
                      >
                        {copiedId === `hash:${ev.id}` ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", color: T.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>
                    {ev.id}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusPill status={ev.status} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {/* Details */}
                      <button
                        onClick={() => { setSelectedEvidence(ev); setVerificationResult(null); }}
                        style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", backgroundColor: "rgba(59,130,246,0.12)", color: T.blue, border: "1px solid rgba(59,130,246,0.35)", transition: "all 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.22)"; e.currentTarget.style.borderColor = "rgba(59,130,246,0.6)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.12)"; e.currentTarget.style.borderColor = "rgba(59,130,246,0.35)"; }}
                      >
                        Details
                      </button>
                      {/* Verify */}
                      <button
                        onClick={() => { setSelectedEvidence(ev); setVerifyModalOpen(true); }}
                        style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", display: "inline-flex", alignItems: "center", gap: 4, transition: "all 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(34,197,94,0.2)"; e.currentTarget.style.borderColor = "rgba(34,197,94,0.5)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(34,197,94,0.1)"; e.currentTarget.style.borderColor = "rgba(34,197,94,0.3)"; }}
                      >
                        <ShieldCheck size={11} /> Verify
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Footer ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 13, color: T.textMuted }}>
            {totalItems === 0
              ? "No results"
              : `Showing ${showingFrom}–${showingTo} of ${totalItems} entries`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: safePage <= 1 ? "not-allowed" : "pointer", backgroundColor: T.cardBg, color: safePage <= 1 ? T.textMuted : T.textLow, border: `1px solid ${T.border}`, opacity: safePage <= 1 ? 0.45 : 1, transition: "all 0.15s" }}
              onMouseEnter={(e) => { if (safePage > 1) { e.currentTarget.style.backgroundColor = "#334155"; e.currentTarget.style.color = T.textHigh; } }}
              onMouseLeave={(e) => { if (safePage > 1) { e.currentTarget.style.backgroundColor = T.cardBg; e.currentTarget.style.color = T.textLow; } }}
            >← Previous</button>
            <span style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, color: T.textLow, backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}>
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: safePage >= totalPages ? "not-allowed" : "pointer", backgroundColor: T.cardBg, color: safePage >= totalPages ? T.textMuted : T.textLow, border: `1px solid ${T.border}`, opacity: safePage >= totalPages ? 0.45 : 1, transition: "all 0.15s" }}
              onMouseEnter={(e) => { if (safePage < totalPages) { e.currentTarget.style.backgroundColor = "#334155"; e.currentTarget.style.color = T.textHigh; } }}
              onMouseLeave={(e) => { if (safePage < totalPages) { e.currentTarget.style.backgroundColor = T.cardBg; e.currentTarget.style.color = T.textLow; } }}
            >Next →</button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          Detail Side Panel
      ══════════════════════════════════════════════════════════════ */}
      {selectedEvidence && !verifyModalOpen && (
        <div style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: 380, backgroundColor: T.cardBg, borderLeft: `1px solid ${T.border}`, padding: 24, zIndex: 50, overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)" }}>
          <button onClick={() => setSelectedEvidence(null)}
            style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: T.textLow, padding: 4 }}
            onMouseEnter={(e) => e.currentTarget.style.color = T.textHigh}
            onMouseLeave={(e) => e.currentTarget.style.color = T.textLow}
          >
            <X size={20} />
          </button>

          <div style={{ fontFamily: "monospace", fontSize: 11, color: T.textMuted, marginBottom: 6 }}>{selectedEvidence.id}</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: T.textHigh, marginBottom: 24, paddingRight: 32, wordBreak: "break-word" }}>{selectedEvidence.fileName}</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <MetaRow label="Case ID">
              <p style={{ fontSize: 13, color: T.textMid, fontFamily: "monospace" }}>{selectedEvidence.caseId}</p>
            </MetaRow>
            <MetaRow label="Type">
              <p style={{ fontSize: 13, color: T.textMid }}>{selectedEvidence.fileType}</p>
            </MetaRow>
            <MetaRow label="Submitted By">
              <p style={{ fontSize: 13, color: T.textMid, fontFamily: "monospace" }}>{selectedEvidence.submittedBy.slice(0, 6)}…{selectedEvidence.submittedBy.slice(-4)}</p>
            </MetaRow>
            <MetaRow label="Timestamp">
              <p style={{ fontSize: 13, color: T.textMid }}>{selectedEvidence.timestamp}</p>
            </MetaRow>
            <MetaRow label="Status">
              <div style={{ marginTop: 4 }}><StatusPill status={selectedEvidence.status} /></div>
            </MetaRow>

            {/* SHA-256 */}
            <MetaRow label="SHA-256 Hash">
              <div style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: 12, marginTop: 4 }}>
                <p style={{ fontFamily: "monospace", fontSize: 12, color: "#22c55e", wordBreak: "break-all", lineHeight: 1.6 }}>{selectedEvidence.hash}</p>
              </div>
              <button onClick={handleCopyHash}
                style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#22c55e", padding: 0 }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.7"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >
                {copiedHash ? <CheckCircle size={13} /> : <Copy size={13} />}
                {copiedHash ? "Copied!" : "Copy hash"}
              </button>
            </MetaRow>

            {/* IPFS CID */}
            <MetaRow label="IPFS CID">
              <a href={`https://ipfs.io/ipfs/${selectedEvidence.cid}`} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: "monospace", fontSize: 12, color: T.blue, wordBreak: "break-all", textDecoration: "none" }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.75"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >
                {selectedEvidence.cid}
              </a>
            </MetaRow>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button onClick={handleExportPDF} style={primaryBtn}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1d4ed8"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = T.blueDark}
              >Export PDF</button>
              <button onClick={() => setSelectedEvidence(null)} style={ghostBtn}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.cardBg; e.currentTarget.style.color = T.textMid; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = T.textLow; }}
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Verify Modal
      ══════════════════════════════════════════════════════════════ */}
      {verifyModalOpen && selectedEvidence && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
          onClick={() => { setVerifyModalOpen(false); setVerificationResult(null); }}
        >
          <div onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)" }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.textHigh, marginBottom: 6 }}>Verify Evidence File</h2>
            <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 24, fontFamily: "monospace" }}>{selectedEvidence.fileName}</p>

            {!verificationResult && (
              <div>
                <p style={{ fontSize: 13, color: T.textLow, marginBottom: 16 }}>Select the original file to verify against the stored hash:</p>
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `2px dashed ${T.border}`, borderRadius: 10, padding: "32px 24px", cursor: "pointer", gap: 8, transition: "border-color 0.2s" }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = T.blue}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = T.border}
                >
                  <ShieldCheck size={28} style={{ color: T.textMuted }} />
                  <span style={{ fontSize: 13, color: T.textLow }}>Click to select file</span>
                  <span style={{ fontSize: 11, color: T.textMuted }}>File stays in your browser — never uploaded</span>
                  <input type="file" onChange={handleVerifyFile} disabled={isVerifying} style={{ display: "none" }} />
                </label>
                {isVerifying && (
                  <p style={{ marginTop: 16, fontSize: 13, color: "#eab308", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, border: "2px solid #eab308", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                    Computing hash…
                  </p>
                )}
              </div>
            )}

            {verificationResult && (
              <div style={{ backgroundColor: verificationResult.matches ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${verificationResult.matches ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {verificationResult.matches
                    ? <CheckCircle size={26} style={{ color: "#22c55e", flexShrink: 0 }} />
                    : <AlertCircle size={26} style={{ color: "#ef4444", flexShrink: 0 }} />
                  }
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: verificationResult.matches ? "#22c55e" : "#ef4444", marginBottom: 4 }}>
                      {verificationResult.matches ? "Hash Verified — File Intact" : "Hash Mismatch — Possible Tampering"}
                    </p>
                    <p style={{ fontSize: 12, color: T.textLow }}>
                      {verificationResult.matches ? "The computed hash matches the stored record exactly." : "The computed hash does NOT match the stored record."}
                    </p>
                  </div>
                </div>
                {!verificationResult.matches && (
                  <div style={{ marginTop: 12, fontSize: 11, fontFamily: "monospace", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div><span style={{ color: T.textMuted }}>Stored:&nbsp;&nbsp;</span><span style={{ color: T.textLow, wordBreak: "break-all" }}>{verificationResult.storedHash}</span></div>
                    <div><span style={{ color: T.textMuted }}>Computed: </span><span style={{ color: "#ef4444", wordBreak: "break-all" }}>{verificationResult.computedHash}</span></div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={() => { setVerifyModalOpen(false); setVerificationResult(null); }} style={primaryBtn}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1d4ed8"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = T.blueDark}
              >Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
