// Evidence Viewer (DEMO).
//
// Honest-demo behaviour:
//  - Every record comes from fictional sample data (src/data/mockData.js). Nothing is on a blockchain.
//  - "Verify" hashes a file you pick, locally in the browser (Web Crypto), and shows that hash next to
//    the stored demo hash. The stored hashes are made up and there is no on-chain record to compare
//    against, so the result is informational only: it never claims the evidence is authentic or intact.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X, Copy, Check, AlertCircle, Search, Hash, Info, Equal, EqualNot } from "lucide-react";
import { mockEvidence, mockCases, mockCustodyLog } from "../data/mockData";
import { computeSHA256 } from "../utils/hash";
import { exportCustodyReport } from "../utils/pdf";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { usePagination } from "../hooks/usePagination";
import Pagination from "../components/Pagination";
import StatusBadge from "../components/StatusBadge";

const ITEMS_PER_PAGE = 10;

const NO_ON_CHAIN_NOTICE =
  "No on-chain record exists in this demo, so this check cannot confirm authenticity or integrity of the evidence.";

// -- Design tokens (mirrors CaseManagement) -----------------------------------------------------
// Text tokens are kept at >= 4.5:1 contrast on the page (#0f172a) and card (#1e293b) backgrounds.
const T = {
  pageBg: "#0f172a",
  cardBg: "#1e293b",
  tableBg: "#0f172a",
  border: "#334155",
  inputBorder: "#64748b", // >= 3:1 against both backgrounds so form controls stay visible
  textHigh: "#f1f5f9",
  textMid: "#e2e8f0",
  textLow: "#cbd5e1",
  textMuted: "#94a3b8",
  blue: "#3b82f6",
  blueDark: "#2563eb",
  blueText: "#60a5fa", // blue for text on dark surfaces
  errorText: "#fca5a5",
};

// Visually hidden but still read by screen readers.
const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  backgroundColor: T.cardBg,
  border: `1px solid ${T.inputBorder}`,
  borderRadius: 8,
  color: T.textHigh,
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

const primaryBtn = {
  flex: 1,
  backgroundColor: T.blueDark,
  color: "#fff",
  padding: "10px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  transition: "background-color 0.2s",
};

const ghostBtn = {
  flex: 1,
  backgroundColor: "transparent",
  color: T.textLow,
  padding: "10px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  border: `1px solid ${T.inputBorder}`,
  cursor: "pointer",
  transition: "all 0.2s",
};

const thStyle = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 600,
  color: T.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
};

const tdStyle = { padding: "12px 16px", whiteSpace: "nowrap" };
const tdMono = { ...tdStyle, fontFamily: "monospace", fontSize: 12, color: T.textMuted };

const alertStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.5,
  color: T.errorText,
  backgroundColor: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.4)",
};

const labelStyle = {
  fontSize: 11,
  color: T.textMuted,
  textTransform: "uppercase",
  letterSpacing: "1px",
  fontWeight: 600,
  marginBottom: 4,
};

const hoverOn = (bg, color) => (e) => {
  e.currentTarget.style.backgroundColor = bg;
  if (color) e.currentTarget.style.color = color;
};

// ---------------------------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------------------------

function MetaRow({ label, children }) {
  return (
    <div>
      <p style={labelStyle}>{label}</p>
      {children}
    </div>
  );
}

function FilterPill({ active, dot, onClick, children }) {
  const [hover, setHover] = useState(false);
  const hovered = hover && !active;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "6px 16px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${active ? T.blue : T.border}`,
        backgroundColor: active ? T.blueDark : hovered ? "#334155" : T.cardBg,
        color: active ? "#fff" : hovered ? T.textMid : T.textLow,
        transition: "all 0.2s",
      }}
    >
      {dot && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: dot }} />}
      {children}
    </button>
  );
}

/** Icon-only copy button used in the table. The label names what is copied. */
function CopyIconButton({ label, copied, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        // 12px icon + 6px padding on each side = 24px target; the negative margin keeps the layout unchanged.
        padding: 6,
        margin: -6,
        color: copied ? "#22c55e" : hover ? T.blueText : T.textMuted,
        transition: "color 0.15s",
        display: "flex",
        alignItems: "center",
      }}
    >
      {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
    </button>
  );
}

function HashBlock({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={labelStyle}>{label}</p>
      <p
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.5,
          color: T.textMid,
          wordBreak: "break-all",
          backgroundColor: T.pageBg,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          padding: 8,
        }}
      >
        {value}
      </p>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal shell shared by the details panel and the verify dialog.
 * role="dialog" + aria-modal, labelled by the heading `labelledBy` points to. Escape and a click on
 * the backdrop close it, Tab stays inside it, focus moves in on open and goes back to whatever was
 * focused before (normally the button that opened it) on close.
 */
function Dialog({ labelledBy, onClose, variant = "modal", initialFocusRef, children }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const pressedInsidePanel = useRef(false);
  const isPanel = variant === "panel";

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    const opener = document.activeElement;
    const focusables = () => Array.from(panel.querySelectorAll(FOCUSABLE));

    (initialFocusRef?.current ?? focusables()[0] ?? panel).focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [initialFocusRef]);

  return (
    <div
      onMouseDown={(e) => {
        pressedInsidePanel.current = e.target !== e.currentTarget;
      }}
      onClick={(e) => {
        // Only a click that both started and ended on the backdrop closes it, so dragging to
        // select text inside the panel and releasing outside does not dismiss it.
        if (e.target === e.currentTarget && !pressedInsidePanel.current) onCloseRef.current();
        pressedInsidePanel.current = false;
      }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: isPanel ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: isPanel ? "stretch" : "center",
        justifyContent: isPanel ? "flex-end" : "center",
        padding: isPanel ? 0 : 16,
        // Above the sticky top bar (90) and the sidebar (100) rendered by Layout.
        zIndex: 1000,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={
          isPanel
            ? {
                position: "relative",
                boxSizing: "border-box",
                width: "min(380px, 100%)",
                backgroundColor: T.cardBg,
                borderLeft: `1px solid ${T.border}`,
                padding: 24,
                overflowY: "auto",
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
                outline: "none",
              }
            : {
                position: "relative",
                boxSizing: "border-box",
                width: "100%",
                maxWidth: 480,
                maxHeight: "calc(100vh - 32px)",
                overflowY: "auto",
                backgroundColor: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: 28,
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
                outline: "none",
              }
        }
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Details side panel
// ---------------------------------------------------------------------------------------------

function DetailsPanel({ evidence, copiedKey, copyFailed, onCopy, onClose }) {
  const titleId = useId();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const copied = copiedKey === `detail-hash:${evidence.id}`;

  const handleExportPDF = async () => {
    setExportError("");
    setIsExporting(true);
    try {
      const caseData = mockCases.find((c) => c.id === evidence.caseId);
      if (!caseData) throw new Error(`no case record found for ${evidence.caseId}`);
      const caseEvidence = mockEvidence.filter((e) => e.caseId === evidence.caseId);
      await exportCustodyReport(caseData, caseEvidence, mockCustodyLog);
    } catch (err) {
      setExportError(`Could not export the PDF: ${err?.message || "unknown error"}.`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog labelledBy={titleId} onClose={onClose} variant="panel">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        title="Close details"
        style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: T.textLow, padding: 8, display: "flex" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = T.textHigh)}
        onMouseLeave={(e) => (e.currentTarget.style.color = T.textLow)}
      >
        <X size={20} aria-hidden="true" />
      </button>

      <div style={{ fontFamily: "monospace", fontSize: 11, color: T.textMuted, marginBottom: 6 }}>{evidence.id}</div>
      <h2 id={titleId} style={{ fontSize: 20, fontWeight: 700, color: T.textHigh, marginBottom: 24, paddingRight: 32, wordBreak: "break-word" }}>
        {evidence.fileName}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <MetaRow label="Case ID">
          <p style={{ fontSize: 13, color: T.textMid, fontFamily: "monospace" }}>{evidence.caseId}</p>
        </MetaRow>
        <MetaRow label="Type">
          <p style={{ fontSize: 13, color: T.textMid }}>{evidence.fileType}</p>
        </MetaRow>
        <MetaRow label="Submitted By">
          <p style={{ fontSize: 13, color: T.textMid, fontFamily: "monospace" }} title={evidence.submittedBy}>
            {evidence.submittedBy.slice(0, 6)}&hellip;{evidence.submittedBy.slice(-4)}
          </p>
        </MetaRow>
        <MetaRow label="Timestamp">
          <p style={{ fontSize: 13, color: T.textMid }}>{evidence.timestamp}</p>
        </MetaRow>
        <MetaRow label="Status (sample data)">
          <div style={{ marginTop: 4 }}>
            <StatusBadge status={evidence.status} />
          </div>
        </MetaRow>

        <MetaRow label="SHA-256 Hash (stored demo value)">
          <div style={{ backgroundColor: T.pageBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, marginTop: 4 }}>
            <p style={{ fontFamily: "monospace", fontSize: 12, color: T.textMid, wordBreak: "break-all", lineHeight: 1.6 }}>{evidence.hash}</p>
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => onCopy(evidence.hash, `detail-hash:${evidence.id}`)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.blueText, padding: "4px 0" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              Copy hash
            </button>
            <span role="status" style={{ fontSize: 12, color: T.textLow }}>
              {copied ? "Copied!" : ""}
            </span>
          </div>
          {copyFailed && (
            <p role="alert" style={{ ...alertStyle, marginTop: 8 }}>
              Could not copy to the clipboard. Your browser may be blocking clipboard access.
            </p>
          )}
        </MetaRow>

        <MetaRow label="IPFS CID">
          <a
            href={`https://ipfs.io/ipfs/${evidence.cid}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "monospace", fontSize: 12, color: T.blueText, wordBreak: "break-all" }}
          >
            {evidence.cid}
            <span style={visuallyHidden}> (opens in a new tab)</span>
          </a>
          <p style={{ fontSize: 12, color: T.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            Sample CID. Nothing was uploaded to IPFS in this demo, so the gateway link may not show this evidence.
          </p>
        </MetaRow>

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={isExporting}
            aria-busy={isExporting}
            style={{ ...primaryBtn, cursor: isExporting ? "progress" : "pointer", opacity: isExporting ? 0.75 : 1 }}
            onMouseEnter={hoverOn("#1d4ed8")}
            onMouseLeave={hoverOn(T.blueDark)}
          >
            {isExporting ? "Exporting…" : "Export PDF"}
          </button>
          <button type="button" onClick={onClose} style={ghostBtn} onMouseEnter={hoverOn("#334155", T.textHigh)} onMouseLeave={hoverOn("transparent", T.textLow)}>
            Close
          </button>
        </div>
        {exportError && (
          <p role="alert" style={{ ...alertStyle, marginTop: 0 }}>
            <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{exportError}</span>
          </p>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Verify dialog: local SHA-256 next to the stored demo hash. Fails closed: any hashing problem
// shows an error and no comparison; a comparison never claims authenticity or integrity.
// ---------------------------------------------------------------------------------------------

function isFocusVisible(el) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

function VerifyDialog({ evidence, onClose }) {
  const titleId = useId();
  const resultTitleId = useId();
  const inputId = useId();
  const inputRef = useRef(null);
  const resultRef = useRef(null);
  const requestRef = useRef(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showRing, setShowRing] = useState(false);
  const [dropHover, setDropHover] = useState(false);

  // Late results from a file picked before the dialog closed must not be applied.
  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    []
  );

  // Keep keyboard focus useful as the content swaps: result region when it appears, file input otherwise.
  useEffect(() => {
    (result ? resultRef : inputRef).current?.focus();
  }, [result]);

  const handleVerify = async (file) => {
    requestRef.current += 1;
    const requestId = requestRef.current;
    setIsVerifying(true);
    setError("");
    setResult(null);
    try {
      const computedHash = await computeSHA256(file);
      if (requestId !== requestRef.current) return;
      setResult({ computedHash, storedHash: evidence.hash, equal: computedHash === evidence.hash.toLowerCase() });
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(`Hash check failed: ${err?.message || "the file could not be hashed."} No comparison was made.`);
    } finally {
      if (requestId === requestRef.current) setIsVerifying(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be chosen again.
    e.target.value = "";
    if (file) handleVerify(file);
  };

  const equal = result?.equal;

  return (
    <Dialog labelledBy={titleId} onClose={onClose} initialFocusRef={inputRef}>
      <h2 id={titleId} style={{ fontSize: 20, fontWeight: 700, color: T.textHigh, marginBottom: 6 }}>
        Verify File Hash (Demo)
      </h2>
      <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 24, fontFamily: "monospace", wordBreak: "break-all" }}>{evidence.fileName}</p>

      {!result && (
        <div>
          <p style={{ fontSize: 13, color: T.textLow, marginBottom: 16 }}>
            Select a file to compute its SHA-256 and compare it with the stored demo hash:
          </p>
          <label
            htmlFor={inputId}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: `2px dashed ${showRing || dropHover ? T.blue : T.inputBorder}`,
              borderRadius: 10,
              padding: "32px 24px",
              cursor: "pointer",
              gap: 8,
              textAlign: "center",
              outline: showRing ? `2px solid ${T.blueText}` : "none",
              outlineOffset: 3,
              transition: "border-color 0.2s",
            }}
            onMouseEnter={() => setDropHover(true)}
            onMouseLeave={() => setDropHover(false)}
          >
            <Hash size={28} aria-hidden="true" style={{ color: T.textMuted }} />
            <span style={{ fontSize: 13, color: T.textLow }}>Click to select file</span>
            <span style={{ fontSize: 11, color: T.textMuted }}>File stays in your browser &mdash; never uploaded</span>
            {/* Visually hidden, not display:none, so it stays reachable and operable with the keyboard. */}
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              onChange={handleFileChange}
              onFocus={(e) => setShowRing(isFocusVisible(e.target))}
              onBlur={() => setShowRing(false)}
              style={visuallyHidden}
            />
          </label>
          {isVerifying && (
            <p role="status" style={{ marginTop: 16, fontSize: 13, color: "#eab308", display: "flex", alignItems: "center", gap: 8 }}>
              <span
                aria-hidden="true"
                className="ev-spinner"
                style={{ width: 12, height: 12, border: "2px solid #eab308", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block" }}
              />
              Computing hash&hellip;
            </p>
          )}
          {error && (
            <p role="alert" style={alertStyle}>
              <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </p>
          )}
        </div>
      )}

      {result && (
        <div
          ref={resultRef}
          role="region"
          aria-labelledby={resultTitleId}
          tabIndex={-1}
          style={{ backgroundColor: "rgba(148,163,184,0.08)", border: `1px solid ${T.inputBorder}`, borderRadius: 8, padding: 16, outline: "none" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            {equal ? (
              <Equal size={24} aria-hidden="true" style={{ color: T.blueText, flexShrink: 0 }} />
            ) : (
              <EqualNot size={24} aria-hidden="true" style={{ color: T.blueText, flexShrink: 0 }} />
            )}
            <div>
              <h3 id={resultTitleId} style={{ fontWeight: 600, fontSize: 14, color: T.textHigh, marginBottom: 4 }}>
                {equal ? "Hash equals the stored demo value" : "Hash differs from the stored demo value"}
              </h3>
              <p style={{ fontSize: 12, color: T.textLow }}>Compared in your browser. Nothing was uploaded.</p>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <HashBlock label="Computed SHA-256 (selected file)" value={result.computedHash} />
            <HashBlock label="Stored demo hash" value={result.storedHash} />
          </div>

          <div
            style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 6, backgroundColor: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.35)" }}
          >
            <Info size={16} aria-hidden="true" style={{ color: "#facc15", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, lineHeight: 1.5, color: T.textMid }}>{NO_ON_CHAIN_NOTICE}</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        {result && (
          <button
            type="button"
            onClick={() => setResult(null)}
            style={{ ...ghostBtn, minWidth: 140 }}
            onMouseEnter={hoverOn("#334155", T.textHigh)}
            onMouseLeave={hoverOn("transparent", T.textLow)}
          >
            Check another file
          </button>
        )}
        <button type="button" onClick={onClose} style={{ ...primaryBtn, minWidth: 140 }} onMouseEnter={hoverOn("#1d4ed8")} onMouseLeave={hoverOn(T.blueDark)}>
          Close
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

const STATUS_FILTERS = [
  { label: "All", dot: T.blue },
  { label: "Verified", dot: "#22c55e" },
  { label: "Pending", dot: "#eab308" },
  { label: "Flagged", dot: "#ef4444" },
];

const TYPE_FILTERS = ["All Types", "Digital Image", "Video", "Document", "Device Log"];

const COLUMNS = ["IPFS CID", "Case ID", "File Name", "Type", "SHA-256", "Internal ID", "Status", "Actions"];

export default function EvidenceViewer() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [dialog, setDialog] = useState(null); // { kind: "details" | "verify", evidence }
  const [copyFailed, setCopyFailed] = useState(false);
  const searchId = useId();
  const { copiedKey, copy } = useCopyToClipboard();

  const filteredEvidence = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return mockEvidence.filter(
      (ev) =>
        (ev.fileName.toLowerCase().includes(q) ||
          ev.caseId.toLowerCase().includes(q) ||
          ev.id.toLowerCase().includes(q) ||
          ev.submittedBy.toLowerCase().includes(q)) &&
        (statusFilter === "All" || ev.status === statusFilter) &&
        (typeFilter === "All" || ev.fileType === typeFilter)
    );
  }, [searchTerm, statusFilter, typeFilter]);

  const { page, setPage, totalPages, pageItems, showingFrom, showingTo, totalItems } = usePagination(filteredEvidence, ITEMS_PER_PAGE);

  const handleCopy = async (text, key) => {
    const ok = await copy(text, key);
    setCopyFailed(!ok);
  };

  const openDialog = (kind, evidence) => {
    setCopyFailed(false);
    setDialog({ kind, evidence });
  };
  const closeDialog = () => setDialog(null);

  const changeSearch = (value) => {
    setSearchTerm(value);
    setPage(1);
  };
  const changeStatus = (value) => {
    setStatusFilter(value);
    setPage(1);
  };
  const changeType = (value) => {
    setTypeFilter(value);
    setPage(1);
  };

  return (
    <div style={{ backgroundColor: T.pageBg, minHeight: "100vh", padding: "clamp(16px, 4vw, 32px)", minWidth: 0, maxWidth: "100%" }}>
      {/* -- Header -- */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.textHigh }}>Evidence Viewer</h1>
        <div style={{ backgroundColor: T.cardBg, color: T.textLow, padding: "4px 12px", borderRadius: 20, fontSize: 13, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.5px", fontSize: 11, fontWeight: 600 }}>Records</span>
          <span style={{ fontWeight: 700 }}>{totalItems}</span>
        </div>
      </div>

      {/* -- Search -- */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <label htmlFor={searchId} style={visuallyHidden}>
          Search evidence by file name, case ID, evidence ID, or submitter address
        </label>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textMuted, pointerEvents: "none" }} />
        <input
          id={searchId}
          className="ev-search"
          type="text"
          autoComplete="off"
          placeholder={"Search by file name, case ID, evidence ID, or submitter…"}
          value={searchTerm}
          onChange={(e) => changeSearch(e.target.value)}
          style={{ ...inputStyle, padding: "10px 16px 10px 40px" }}
          onFocus={(e) => {
            e.target.style.borderColor = T.blue;
            e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.45)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = T.inputBorder;
            e.target.style.boxShadow = "none";
          }}
        />
      </div>

      {/* -- Filters -- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <div role="group" aria-label="Filter by status" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {STATUS_FILTERS.map(({ label, dot }) => (
            <FilterPill key={label} active={statusFilter === label} dot={dot} onClick={() => changeStatus(label)}>
              {label}
            </FilterPill>
          ))}
        </div>

        <div aria-hidden="true" style={{ width: 1, alignSelf: "stretch", backgroundColor: T.border, margin: "0 4px" }} />

        <div role="group" aria-label="Filter by type" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TYPE_FILTERS.map((label) => {
            const value = label === "All Types" ? "All" : label;
            return (
              <FilterPill key={label} active={typeFilter === value} onClick={() => changeType(value)}>
                {label}
              </FilterPill>
            );
          })}
        </div>
      </div>

      {copyFailed && !dialog && (
        <p role="alert" style={{ ...alertStyle, marginTop: 0, marginBottom: 16 }}>
          Could not copy to the clipboard. Your browser may be blocking clipboard access.
        </p>
      )}
      <span role="status" style={visuallyHidden}>
        {copiedKey && !dialog ? "Copied to clipboard." : ""}
      </span>

      {/* -- Table -- */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", backgroundColor: T.tableBg }}>
        {/* Scrolls sideways on narrow screens; focusable so keyboard users can scroll it.
            contain: inline-size stops the wide table from forcing the whole page wider. */}
        <div role="region" aria-label="Evidence records" tabIndex={0} style={{ overflowX: "auto", contain: "inline-size" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <caption style={visuallyHidden}>Evidence records (sample data)</caption>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: T.cardBg }}>
                {COLUMNS.map((col) => (
                  <th key={col} scope="col" style={thStyle}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} style={{ padding: "48px 16px", textAlign: "center", color: T.textMuted, fontSize: 14 }}>
                    No evidence records match your filters.
                  </td>
                </tr>
              ) : (
                pageItems.map((ev) => (
                  <tr key={ev.id} className="ev-row" style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ ...tdMono, color: T.blueText }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span title={ev.cid}>{ev.cid.slice(0, 16)}&hellip;</span>
                        <CopyIconButton
                          label={`Copy IPFS CID of ${ev.fileName}`}
                          copied={copiedKey === `cid:${ev.id}`}
                          onClick={() => handleCopy(ev.cid, `cid:${ev.id}`)}
                        />
                      </span>
                    </td>
                    <td style={tdMono}>{ev.caseId}</td>
                    <td style={{ ...tdStyle, color: T.textMid, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={ev.fileName}>
                      {ev.fileName}
                    </td>
                    <td style={{ ...tdStyle, color: T.textLow, fontSize: 12 }}>{ev.fileType}</td>
                    <td style={tdMono}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span title={ev.hash}>{ev.hash.slice(0, 12)}&hellip;</span>
                        <CopyIconButton
                          label={`Copy SHA-256 hash of ${ev.fileName}`}
                          copied={copiedKey === `hash:${ev.id}`}
                          onClick={() => handleCopy(ev.hash, `hash:${ev.id}`)}
                        />
                      </span>
                    </td>
                    <td style={tdMono}>{ev.id}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <StatusBadge status={ev.status} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          aria-label={`Details for ${ev.fileName}`}
                          onClick={() => openDialog("details", ev)}
                          style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", backgroundColor: "rgba(59,130,246,0.12)", color: T.blueText, border: "1px solid rgba(59,130,246,0.35)", transition: "all 0.15s" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.22)";
                            e.currentTarget.style.borderColor = "rgba(59,130,246,0.6)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.12)";
                            e.currentTarget.style.borderColor = "rgba(59,130,246,0.35)";
                          }}
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          aria-label={`Verify hash for ${ev.fileName}`}
                          onClick={() => openDialog("verify", ev)}
                          style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", backgroundColor: "rgba(148,163,184,0.1)", color: T.textLow, border: "1px solid rgba(148,163,184,0.4)", display: "inline-flex", alignItems: "center", gap: 4, transition: "all 0.15s" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(148,163,184,0.2)";
                            e.currentTarget.style.borderColor = "rgba(148,163,184,0.6)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(148,163,184,0.1)";
                            e.currentTarget.style.borderColor = "rgba(148,163,184,0.4)";
                          }}
                        >
                          <Hash size={11} aria-hidden="true" /> Verify
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalItems > 0 && (
          <div style={{ padding: "0 16px", borderTop: `1px solid ${T.border}` }}>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              showingFrom={showingFrom}
              showingTo={showingTo}
              totalItems={totalItems}
            />
          </div>
        )}
      </div>

      {dialog?.kind === "details" && (
        <DetailsPanel
          key={dialog.evidence.id}
          evidence={dialog.evidence}
          copiedKey={copiedKey}
          copyFailed={copyFailed}
          onCopy={handleCopy}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "verify" && <VerifyDialog key={dialog.evidence.id} evidence={dialog.evidence} onClose={closeDialog} />}

      <style>{`
        @keyframes ev-spin { to { transform: rotate(360deg); } }
        .ev-spinner { animation: ev-spin 0.8s linear infinite; }
        .ev-row:hover { background-color: rgba(59,130,246,0.05); }
        .ev-search::placeholder { color: ${T.textMuted}; opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .ev-spinner { animation: none; } }
      `}</style>
    </div>
  );
}
