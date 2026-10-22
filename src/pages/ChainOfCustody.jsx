import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import Pagination from "../components/Pagination";
import StatusBadge from "../components/StatusBadge";
import { mockCustodyLog } from "../data/mockData";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { usePagination } from "../hooks/usePagination";

// All data on this page is fictional demo data (see src/data/mockData.js). Nothing here is
// read from, or written to, a blockchain.
const auditLogs = mockCustodyLog;

const EVENT_TYPES = ["All", "Submit", "Access", "Verify"];
const PAGE_SIZE = 10;
const ELLIPSIS = "\u2026";

// What each kind of copy button copies, used in the screen-reader/status message.
const COPY_LABELS = { tx: "transaction hash", cid: "CID", addr: "wallet address" };

const STATS = {
  total: auditLogs.length,
  verifyEvents: auditLogs.filter((log) => log.eventType === "Verify").length,
  uniqueCids: new Set(auditLogs.map((log) => log.cidHash)).size,
};

const truncate = (value, length) => (value.length > length ? value.slice(0, length) + ELLIPSIS : value);
const truncateAddress = (address) =>
  address.length > 12 ? address.slice(0, 6) + ELLIPSIS + address.slice(-4) : address;

// Colors: every text color below has at least 4.5:1 contrast on #0f172a and #1e293b.
// Hover/focus states live in this scoped stylesheet because inline styles cannot express them.
const SCOPED_CSS = `
.coc-field::placeholder { color: #94a3b8; opacity: 1; }
.coc-field:focus { border-color: #60a5fa; }
.coc-field:focus-visible,
.coc-copy:focus-visible,
.coc-scroll:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
.coc-row:hover { background: rgba(59, 130, 246, 0.08); }
.coc-copy { color: #60a5fa; }
.coc-copy:hover { color: #bfdbfe; }
.coc-copy[data-copied="true"] { color: #4ade80; }
`;

const GUTTER = "clamp(16px, 4vw, 32px)";
const MONO = "'JetBrains Mono', monospace";

const styles = {
  page: { background: "#0f172a", minHeight: "100%", width: "100%", color: "#e2e8f0" },
  header: {
    padding: `32px ${GUTTER} 24px`,
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    marginBottom: "32px",
  },
  title: { fontSize: "28px", fontWeight: 700, color: "#e2e8f0", marginBottom: "8px", lineHeight: 1.25 },
  subtitle: { fontSize: "14px", color: "#cbd5e1", maxWidth: "70ch" },
  section: { padding: `0 ${GUTTER}` },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "16px",
    marginBottom: "32px",
  },
  statCard: { padding: "16px", background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" },
  statLabel: {
    fontSize: "12px",
    color: "#cbd5e1",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 600,
    marginBottom: "8px",
  },
  statValue: { fontSize: "24px", fontWeight: 700, color: "#e2e8f0" },
  controls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
  },
  fieldWrap: { minWidth: 0 },
  label: { display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 600 },
  field: {
    width: "100%",
    padding: "10px 14px",
    background: "#1e293b",
    // #64748b gives the field boundary 3:1 contrast against the page background.
    border: "1px solid #64748b",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "13px",
    fontFamily: MONO,
    transition: "border-color 0.2s",
  },
  select: { cursor: "pointer", colorScheme: "dark" },
  note: {
    margin: "0 0 4px",
    padding: "10px 14px",
    background: "rgba(234, 179, 8, 0.08)",
    border: "1px solid rgba(234, 179, 8, 0.35)",
    borderRadius: "6px",
    fontSize: "13px",
    color: "#e2e8f0",
  },
  status: { minHeight: "24px", margin: "4px 0 8px", fontSize: "13px", color: "#cbd5e1" },
  scroll: { overflowX: "auto", border: "1px solid #334155", borderRadius: "8px", background: "#0f172a" },
  table: { width: "100%", minWidth: "860px", borderCollapse: "collapse" },
  th: {
    padding: "14px 12px",
    textAlign: "left",
    fontSize: "11px",
    fontWeight: 700,
    color: "#cbd5e1",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    whiteSpace: "nowrap",
  },
  row: { borderBottom: "1px solid #334155" },
  td: { padding: "12px", fontSize: "13px", color: "#cbd5e1", fontFamily: MONO, verticalAlign: "middle" },
  valueWithCopy: { display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" },
  cid: { color: "#60a5fa", fontSize: "12px" },
  txHash: { color: "#94a3b8", fontSize: "12px" },
  empty: { padding: "48px 16px", textAlign: "center", color: "#cbd5e1", fontSize: "14px" },
  copyButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "6px",
    minWidth: "28px",
    minHeight: "28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    transition: "color 0.15s",
  },
  paginationWrap: { padding: `12px ${GUTTER} 32px` },
};

// Visually hidden, still announced by screen readers.
const srOnly = {
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

function CopyButton({ label, copied, onCopy }) {
  return (
    <button
      type="button"
      className="coc-copy"
      aria-label={label}
      title={label}
      data-copied={copied ? "true" : "false"}
      onClick={onCopy}
      style={styles.copyButton}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}

export default function ChainOfCustody() {
  const [cidFilter, setCidFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("All");
  const [copyFailed, setCopyFailed] = useState(false);
  const { copiedKey, copy } = useCopyToClipboard();

  const filteredLogs = useMemo(() => {
    const needle = cidFilter.trim().toLowerCase();
    return auditLogs.filter(
      (log) =>
        (eventTypeFilter === "All" || log.eventType === eventTypeFilter) &&
        log.cidHash.toLowerCase().includes(needle)
    );
  }, [cidFilter, eventTypeFilter]);

  const { page, setPage, totalPages, pageItems, showingFrom, showingTo, totalItems } = usePagination(
    filteredLogs,
    PAGE_SIZE
  );

  // Show the "copy failed" message briefly; the timer is cleared on unmount.
  useEffect(() => {
    if (!copyFailed) return undefined;
    const timer = setTimeout(() => setCopyFailed(false), 4000);
    return () => clearTimeout(timer);
  }, [copyFailed]);

  const handleCidFilterChange = (event) => {
    setCidFilter(event.target.value);
    setPage(1);
  };

  const handleEventTypeChange = (event) => {
    setEventTypeFilter(event.target.value);
    setPage(1);
  };

  const handleCopy = async (text, key) => {
    const copied = await copy(text, key);
    setCopyFailed(!copied);
  };

  let statusMessage = "";
  if (copyFailed) {
    statusMessage = "Could not copy: clipboard access is not available in this browser.";
  } else if (copiedKey) {
    const separator = copiedKey.indexOf(":");
    const kind = copiedKey.slice(0, separator);
    const id = copiedKey.slice(separator + 1);
    statusMessage = `Copied ${COPY_LABELS[kind] ?? "value"} for ${id} to the clipboard.`;
  }

  return (
    <div style={styles.page}>
      <style>{SCOPED_CSS}</style>

      <div style={styles.header}>
        <h1 style={styles.title}>Chain of Custody Audit Log</h1>
        <p style={styles.subtitle}>
          Demo audit log of evidence handling events. These entries are sample data and are not recorded on a blockchain.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.stats}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Total Events</div>
            <div style={styles.statValue}>{STATS.total}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Verify Events</div>
            <div style={styles.statValue}>{STATS.verifyEvents}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Unique CIDs</div>
            <div style={styles.statValue}>{STATS.uniqueCids}</div>
          </div>
        </div>

        <div style={styles.controls}>
          <div style={styles.fieldWrap}>
            <label htmlFor="coc-cid-filter" style={styles.label}>
              Filter by IPFS CID
            </label>
            <input
              id="coc-cid-filter"
              className="coc-field"
              type="text"
              placeholder="Qm... or bafy..."
              autoComplete="off"
              spellCheck={false}
              value={cidFilter}
              onChange={handleCidFilterChange}
              style={styles.field}
            />
          </div>
          <div style={styles.fieldWrap}>
            <label htmlFor="coc-event-type" style={styles.label}>
              Event Type
            </label>
            <select
              id="coc-event-type"
              className="coc-field"
              value={eventTypeFilter}
              onChange={handleEventTypeChange}
              style={{ ...styles.field, ...styles.select }}
            >
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p style={styles.note}>
          <strong>Demo data only.</strong> Sample values for demonstration; these transactions do not exist.
        </p>
        <p role="status" style={styles.status}>
          {statusMessage}
        </p>

        <div className="coc-scroll" role="region" aria-labelledby="coc-table-caption" tabIndex={0} style={styles.scroll}>
          <table style={styles.table}>
            <caption id="coc-table-caption" style={srOnly}>
              Custody log events (sample data). Scroll sideways to see all columns on small screens.
            </caption>
            <thead>
              <tr>
                <th scope="col" style={styles.th}>Event Type</th>
                <th scope="col" style={styles.th}>IPFS CID</th>
                <th scope="col" style={styles.th}>Officer (Address)</th>
                <th scope="col" style={styles.th}>Timestamp</th>
                <th scope="col" style={styles.th}>Transaction Hash (sample)</th>
                <th scope="col" style={styles.th}>Block (sample)</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.empty}>
                    No events match your filters
                  </td>
                </tr>
              ) : (
                pageItems.map((log) => (
                  <tr key={log.id} className="coc-row" style={styles.row}>
                    <td style={styles.td}>
                      <StatusBadge status={log.eventType} />
                    </td>
                    <td style={styles.td}>
                      <span style={styles.valueWithCopy}>
                        <span style={styles.cid} title={log.cidHash}>
                          {truncate(log.cidHash, 16)}
                        </span>
                        <CopyButton
                          label={`Copy full CID for event ${log.id}`}
                          copied={copiedKey === `cid:${log.id}`}
                          onCopy={() => handleCopy(log.cidHash, `cid:${log.id}`)}
                        />
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.valueWithCopy}>
                        <span title={log.actor}>{truncateAddress(log.actor)}</span>
                        <CopyButton
                          label={`Copy full wallet address for event ${log.id}`}
                          copied={copiedKey === `addr:${log.id}`}
                          onCopy={() => handleCopy(log.actor, `addr:${log.id}`)}
                        />
                      </span>
                    </td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>{log.timestamp}</td>
                    <td style={styles.td}>
                      <span style={styles.valueWithCopy}>
                        <span style={styles.txHash} title={log.txHash}>
                          {truncate(log.txHash, 12)}
                        </span>
                        <CopyButton
                          label={`Copy transaction hash for event ${log.id}`}
                          copied={copiedKey === `tx:${log.id}`}
                          onCopy={() => handleCopy(log.txHash, `tx:${log.id}`)}
                        />
                      </span>
                    </td>
                    <td style={styles.td}>{log.blockNumber.toLocaleString("en-US")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={styles.paginationWrap}>
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          showingFrom={showingFrom}
          showingTo={showingTo}
          totalItems={totalItems}
        />
      </div>
    </div>
  );
}
