import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { mockCases, mockEvidence, mockCustodyLog } from "../data/mockData";
import { exportCustodyReport } from "../utils/pdf";
import StatusBadge from "../components/StatusBadge";
import Toast from "../components/Toast";

const STATUS_FILTERS = ["All", "Active", "Under Review", "Closed"];

const FILTER_DOT_COLORS = {
  All: "#3b82f6",
  Active: "#22c55e",
  "Under Review": "#eab308",
  Closed: "#64748b",
};

const MONO = "'JetBrains Mono', monospace";

// Elements the Tab key can reach inside the case dialog (used for the focus trap).
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Text colors on the dark surfaces (#0f172a / #1e293b): #94a3b8 is at least 5.7:1, #e2e8f0 at least 11.8:1.
// The old #64748b labels measured only 3.1 to 3.8:1.
const labelStyle = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: "4px",
};

const sectionHeadingStyle = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: "12px",
};

const thStyle = {
  textAlign: "left",
  padding: "12px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

// Visually hidden but still read by screen readers (no CSS file needed).
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

const truncateAddress = (address) => `${address.slice(0, 8)}…${address.slice(-6)}`;

// Hover colors applied through the element that owns the handler (currentTarget), so hovering a
// child such as an icon does not restyle the child. Disabled buttons keep their look.
const hoverStyle = (rest, hover) => ({
  onMouseEnter: (e) => {
    if (!e.currentTarget.disabled) Object.assign(e.currentTarget.style, hover);
  },
  onMouseLeave: (e) => Object.assign(e.currentTarget.style, rest),
});

const getCaseEvidence = (caseId) => mockEvidence.filter((e) => e.caseId === caseId);

export default function CaseManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedCase, setSelectedCase] = useState(null);
  const [highlightedCardId, setHighlightedCardId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  const searchId = useId();
  const filterLabelId = useId();
  const dialogTitleId = useId();
  const dialogRef = useRef(null);
  const exportButtonRef = useRef(null);
  const triggerRef = useRef(null);
  const toastCounterRef = useRef(0);

  const isOpen = selectedCase !== null;

  // Case dialog: move focus in, close on Escape, keep Tab inside, and give focus back to the
  // button that opened it.
  useEffect(() => {
    if (!isOpen) return undefined;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedCase(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === dialog)) {
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
      const trigger = triggerRef.current;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen]);

  // A disabled button cannot keep keyboard focus. When the export finishes, put focus back on
  // it so Tab does not restart behind the dialog.
  useEffect(() => {
    if (exporting) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) exportButtonRef.current?.focus();
  }, [exporting]);

  const query = searchTerm.trim().toLowerCase();
  const filteredCases = mockCases.filter((c) => {
    const matchesSearch = c.id.toLowerCase().includes(query) || c.title.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "All" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedEvidence = selectedCase ? getCaseEvidence(selectedCase.id) : [];

  const showToast = (type, message) => {
    toastCounterRef.current += 1;
    setToast({ id: toastCounterRef.current, type, message });
  };

  const openCase = (caseData, event) => {
    triggerRef.current = event.currentTarget;
    setSelectedCase(caseData);
  };

  const handleExportPDF = async (caseData) => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportCustodyReport(caseData, getCaseEvidence(caseData.id), mockCustodyLog);
      showToast("success", "Demo report downloaded.");
    } catch (error) {
      console.error("Demo report export failed:", error);
      showToast("error", "Could not generate the report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh", padding: "clamp(8px, 4vw, 32px)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <h1 style={{ fontSize: "clamp(22px, 5vw, 28px)", fontWeight: 700, color: "#f1f5f9" }}>Case Management</h1>
        <div
          style={{
            backgroundColor: "#1e293b",
            color: "#94a3b8",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "13px",
            border: "1px solid #334155",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "11px", fontWeight: 600 }}>
            Total cases
          </span>
          <span style={{ fontWeight: 700 }}>{mockCases.length}</span>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div style={{ position: "relative", marginBottom: "20px" }}>
        <label htmlFor={searchId} style={visuallyHidden}>
          Search cases by ID or title
        </label>
        <Search
          size={18}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#94a3b8",
            pointerEvents: "none",
          }}
        />
        <input
          id={searchId}
          type="search"
          placeholder="Search by case ID or title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            backgroundColor: "#1e293b",
            border: "1px solid #64748b",
            borderRadius: "8px",
            padding: "10px 16px 10px 40px",
            color: "#f1f5f9",
            fontSize: "14px",
            boxSizing: "border-box",
            WebkitAppearance: "none",
            appearance: "none",
          }}
        />
      </div>

      {/* FILTER BUTTONS */}
      <div role="group" aria-labelledby={filterLabelId} style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span id={filterLabelId} style={visuallyHidden}>
          Filter by case status
        </span>
        {STATUS_FILTERS.map((status) => {
          const isActive = statusFilter === status;
          const rest = { backgroundColor: "#1e293b", color: "#94a3b8" };
          return (
            <button
              key={status}
              type="button"
              aria-pressed={isActive}
              onClick={() => setStatusFilter(status)}
              {...(isActive ? {} : hoverStyle(rest, { backgroundColor: "#334155", color: "#cbd5e1" }))}
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                border: isActive ? "1px solid #3b82f6" : "1px solid #334155",
                backgroundColor: isActive ? "#2563eb" : rest.backgroundColor,
                color: isActive ? "#ffffff" : rest.color,
                transition: "background-color 0.2s, color 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: FILTER_DOT_COLORS[status] }}
              ></span>
              {status}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "16px" }}>
        Showing {filteredCases.length} of {mockCases.length} cases
      </p>

      {/* CASES GRID */}
      {filteredCases.length > 0 ? (
        <ul
          role="list"
          style={{
            listStyle: "none",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {filteredCases.map((caseData) => {
            const highlighted = highlightedCardId === caseData.id;
            const evidenceLabel = `${caseData.evidenceCount} ${caseData.evidenceCount === 1 ? "item" : "items"}`;
            return (
              <li
                key={caseData.id}
                onMouseEnter={() => setHighlightedCardId(caseData.id)}
                onMouseLeave={() => setHighlightedCardId(null)}
                onFocus={() => setHighlightedCardId(caseData.id)}
                onBlur={() => setHighlightedCardId(null)}
                style={{
                  minWidth: 0,
                  backgroundColor: "#1e293b",
                  border: highlighted ? "1px solid #3b82f6" : "1px solid #334155",
                  borderRadius: "12px",
                  overflow: "hidden",
                  transition: "border-color 0.2s",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* CARD TOP */}
                <div style={{ padding: "16px 20px", flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontFamily: MONO, fontSize: "12px", color: "#94a3b8" }}>{caseData.id}</div>
                    <StatusBadge status={caseData.status} />
                  </div>

                  <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#f1f5f9", margin: "8px 0", overflowWrap: "anywhere" }}>
                    {caseData.title}
                  </h2>

                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                      gap: "12px 16px",
                      marginTop: "12px",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <dt style={labelStyle}>Officer</dt>
                      <dd
                        title={caseData.officer}
                        style={{ margin: 0, fontSize: "13px", color: "#e2e8f0", fontFamily: MONO, overflowWrap: "anywhere" }}
                      >
                        {truncateAddress(caseData.officer)}
                      </dd>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <dt style={labelStyle}>Date Opened</dt>
                      <dd style={{ margin: 0, fontSize: "13px", color: "#e2e8f0" }}>
                        <time dateTime={caseData.dateOpened}>{caseData.dateOpened}</time>
                      </dd>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <dt style={labelStyle}>Evidence</dt>
                      <dd style={{ margin: 0, fontSize: "13px", color: "#e2e8f0" }}>{evidenceLabel}</dd>
                    </div>
                  </dl>
                </div>

                {/* CARD BOTTOM - View Case Button */}
                <button
                  type="button"
                  aria-label={`View Case Details for ${caseData.id}`}
                  onClick={(e) => openCase(caseData, e)}
                  {...hoverStyle(
                    { backgroundColor: "#0f172a", color: "#94a3b8" },
                    { backgroundColor: "#2563eb", color: "#ffffff" }
                  )}
                  style={{
                    width: "100%",
                    padding: "12px 10px",
                    backgroundColor: "#0f172a",
                    color: "#94a3b8",
                    border: "none",
                    borderTop: "1px solid #334155",
                    cursor: "pointer",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    transition: "background-color 0.2s, color 0.2s",
                  }}
                >
                  View Case Details <ArrowRight size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ textAlign: "center", padding: "48px 16px", color: "#94a3b8", fontSize: "14px" }}>
          No cases match your search filters
        </p>
      )}

      {/* CASE DETAIL DIALOG */}
      {selectedCase && (
        <div
          style={{
            position: "fixed",
            inset: "0",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // Above Layout's sticky header (z-index 90) and sidebar (100); below the toast (1100).
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCase(null);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
            style={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "700px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
              outline: "none",
            }}
          >
            {/* Dialog Header */}
            <div
              style={{
                padding: "20px",
                borderBottom: "1px solid #334155",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                position: "sticky",
                top: "0",
                backgroundColor: "#1e293b",
                zIndex: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: "12px", color: "#94a3b8", marginBottom: "8px" }}>
                  {selectedCase.id}
                </div>
                <h2 id={dialogTitleId} style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9", overflowWrap: "anywhere" }}>
                  {selectedCase.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close case details"
                onClick={() => setSelectedCase(null)}
                {...hoverStyle({ color: "#94a3b8" }, { color: "#f1f5f9" })}
                style={{
                  flexShrink: 0,
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  padding: "4px",
                }}
              >
                <X size={24} aria-hidden="true" />
              </button>
            </div>

            {/* Dialog Content */}
            <div style={{ padding: "clamp(16px, 4vw, 24px)" }}>
              {/* Case Metadata */}
              <div style={{ marginBottom: "24px" }}>
                <h3 style={sectionHeadingStyle}>Case Information</h3>
                <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "20px 24px" }}>
                  <div style={{ minWidth: 0 }}>
                    <dt style={{ ...labelStyle, marginBottom: "6px" }}>Status</dt>
                    <dd style={{ margin: 0 }}>
                      <StatusBadge status={selectedCase.status} size="lg" />
                    </dd>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <dt style={{ ...labelStyle, marginBottom: "6px" }}>Date Opened</dt>
                    <dd style={{ margin: 0, fontSize: "13px", color: "#e2e8f0", fontFamily: MONO }}>
                      <time dateTime={selectedCase.dateOpened}>{selectedCase.dateOpened}</time>
                    </dd>
                  </div>
                  <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
                    <dt style={{ ...labelStyle, marginBottom: "6px" }}>Investigating Officer</dt>
                    <dd
                      title={selectedCase.officer}
                      style={{ margin: 0, fontSize: "13px", color: "#e2e8f0", fontFamily: MONO, overflowWrap: "anywhere" }}
                    >
                      {selectedCase.officer}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Evidence Table */}
              <div style={{ marginBottom: "24px" }}>
                <h3 style={sectionHeadingStyle}>Associated Evidence ({selectedEvidence.length})</h3>
                <div
                  role="region"
                  aria-label="Associated evidence table"
                  tabIndex={0}
                  style={{
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    overflowX: "auto",
                    backgroundColor: "#0f172a",
                  }}
                >
                  <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #334155", backgroundColor: "#1e293b" }}>
                        <th scope="col" style={thStyle}>IPFS CID (sample)</th>
                        <th scope="col" style={thStyle}>File Name</th>
                        <th scope="col" style={thStyle}>Type</th>
                        <th scope="col" style={thStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEvidence.length > 0 ? (
                        selectedEvidence.map((ev) => (
                          <tr key={ev.id} style={{ borderBottom: "1px solid #334155" }}>
                            <td title={ev.cid} style={{ padding: "12px", fontFamily: MONO, color: "#60a5fa", fontSize: "12px" }}>
                              {ev.cid.slice(0, 12)}…
                            </td>
                            <td style={{ padding: "12px", color: "#e2e8f0", fontSize: "12px" }}>{ev.fileName}</td>
                            <td style={{ padding: "12px", color: "#94a3b8", fontSize: "12px" }}>{ev.fileType}</td>
                            <td style={{ padding: "12px" }}>
                              <StatusBadge status={ev.status} />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                            No evidence associated with this case
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>
                  Demo data: identifiers and statuses are fictional. Nothing here is recorded on a blockchain or verified.
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  ref={exportButtonRef}
                  type="button"
                  disabled={exporting}
                  aria-busy={exporting}
                  onClick={() => handleExportPDF(selectedCase)}
                  {...hoverStyle({ backgroundColor: "#2563eb" }, { backgroundColor: "#1d4ed8" })}
                  style={{
                    flex: "1 1 160px",
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: "none",
                    cursor: exporting ? "progress" : "pointer",
                    opacity: exporting ? 0.7 : 1,
                    transition: "background-color 0.2s",
                  }}
                >
                  {exporting ? "Generating report…" : "Export Demo PDF Report"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCase(null)}
                  {...hoverStyle(
                    { backgroundColor: "transparent", color: "#94a3b8", borderColor: "#64748b" },
                    { backgroundColor: "#334155", color: "#f1f5f9", borderColor: "#94a3b8" }
                  )}
                  style={{
                    flex: "1 1 160px",
                    backgroundColor: "transparent",
                    color: "#94a3b8",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: "1px solid #64748b",
                    cursor: "pointer",
                    transition: "background-color 0.2s, color 0.2s, border-color 0.2s",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast key={toast.id} type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
