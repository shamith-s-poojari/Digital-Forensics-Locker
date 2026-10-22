import { useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  FolderOpen,
  Activity,
  TriangleAlert,
  ArrowRight,
  Copy,
  Check,
  Upload,
  Search,
  GitBranch,
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard.js";
import { mockEvidence, mockCases, mockCustodyLog } from "../data/mockData";

// Muted text is #94a3b8 (6.96:1 on #0f172a, 5.71:1 on the #1e293b cards); links are #60a5fa
// (7.0:1 / 5.75:1). Both are above the WCAG AA text minimum of 4.5:1.
const MUTED = "#94a3b8";
const LINK = "#60a5fa";
const MONO = "'JetBrains Mono', monospace";

// Hover, keyboard focus and the small-screen tweaks can't be written inline, so they live in
// one scoped stylesheet. #93c5fd focus rings are 8:1+ on the card background (3:1 is required).
const DASHBOARD_CSS = `
.dfl-dash a:focus-visible,
.dfl-dash button:focus-visible,
.dfl-dash [role="region"]:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
.dfl-dash-card { padding: 24px; }
.dfl-dash-title { font-size: 28px; }
.dfl-dash-row:hover { background: rgba(59,130,246,0.06); }
.dfl-dash-action { transition: background 0.2s; }
.dfl-dash-action:hover { background: rgba(59,130,246,0.08); }
.dfl-dash-copy { color: ${MUTED}; transition: color 0.15s; }
.dfl-dash-copy:hover { color: ${LINK}; }
@media (max-width: 767px) {
  .dfl-dash-card { padding: 16px; }
  .dfl-dash-title { font-size: 24px; }
}
`;

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

const truncateAddress = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

// Human-readable description of a copy-button key such as "cid:EVD-2025-001".
const describeCopyKey = (key) => {
  const [kind, id] = key.split(":");
  return `${kind === "hash" ? "SHA-256 hash" : "CID"} for ${id}`;
};

function CopyButton({ copyKey, value, label, copiedKey, failedKey, onCopy }) {
  const copied = copiedKey === copyKey;
  const failed = failedKey === copyKey;
  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      className="dfl-dash-copy"
      onClick={() => onCopy(value, copyKey)}
      aria-label={`Copy ${label}`}
      title={failed ? "Copy failed. Select the text and copy it manually." : `Copy ${label}`}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px",
        borderRadius: "4px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // Inline color beats the stylesheet, so only set it for the transient copied/failed states.
        ...(copied ? { color: "#4ade80" } : failed ? { color: "#f87171" } : null),
      }}
    >
      <Icon size={14} aria-hidden="true" focusable="false" />
    </button>
  );
}

export default function Dashboard() {
  const { copiedKey, copy } = useCopyToClipboard();
  const [failedKey, setFailedKey] = useState(null);
  const evidenceHeadingId = useId();
  const custodyHeadingId = useId();
  const actionsHeadingId = useId();

  const handleCopy = async (text, key) => {
    setFailedKey(null);
    const ok = await copy(text, key);
    if (!ok) setFailedKey(key);
  };

  const headerStyle = {
    marginBottom: "28px",
  };

  const titleStyle = {
    fontWeight: 700,
    color: "#f0f6fc",
    marginBottom: "4px",
  };

  const subtitleStyle = {
    fontSize: "14px",
    color: MUTED,
  };

  const statsGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px",
    listStyle: "none",
  };

  const cardStyle = {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
  };

  const iconContainerStyle = (color) => ({
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    background: `rgba(${color}, 0.12)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
  });

  const statNumberStyle = {
    fontSize: "36px",
    fontWeight: 700,
    color: "#f0f6fc",
    marginBottom: "8px",
    lineHeight: 1.2,
  };

  const statLabelStyle = {
    fontSize: "12px",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: "1px",
  };

  const statNoteStyle = {
    fontSize: "12px",
    color: "#cbd5e1",
    marginTop: "12px",
  };

  const sectionTitleStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#f0f6fc",
    marginBottom: "16px",
  };

  const sectionHeaderStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "16px",
  };

  const viewAllLinkStyle = {
    fontSize: "13px",
    color: LINK,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  };

  const tableScrollStyle = {
    overflowX: "auto",
  };

  const tableStyle = {
    width: "100%",
    minWidth: "760px",
    borderCollapse: "collapse",
  };

  const tableHeaderStyle = {
    background: "#1e293b",
    color: MUTED,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    padding: "12px 16px",
    borderBottom: "1px solid #334155",
    textAlign: "left",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };

  const tableRowStyle = {
    borderBottom: "1px solid #334155",
    transition: "background 0.15s",
  };

  const tableCellStyle = {
    padding: "12px 16px",
    fontSize: "14px",
    color: "#f0f6fc",
    whiteSpace: "nowrap",
  };

  const monoStyle = {
    fontFamily: MONO,
    fontSize: "13px",
    color: MUTED,
  };

  const copyableValueStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  };

  const timelineContainerStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "20px",
    marginTop: "24px",
  };

  const listResetStyle = {
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
  };

  const timelineEventStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "12px 0",
    borderBottom: "1px solid #334155",
  };

  const actionLinkStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "14px 16px",
    borderBottom: "1px solid #334155",
    color: "#f0f6fc",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 500,
  };

  // Everything below is derived from the sample data set, so the cards can't disagree with the tables.
  const recentEvidence = mockEvidence.slice(0, 5);
  const recentCustody = mockCustodyLog.slice(0, 4);
  const caseCount = new Set(mockEvidence.map((ev) => ev.caseId)).size;
  const openCases = mockCases.filter((c) => c.status !== "Closed").length;
  const pendingCount = mockEvidence.filter((ev) => ev.status === "Pending").length;
  const flaggedCount = mockEvidence.filter((ev) => ev.status === "Flagged").length;

  const stats = [
    {
      label: "Total Evidence",
      value: mockEvidence.length,
      note: `Across ${caseCount} ${caseCount === 1 ? "case" : "cases"}`,
      icon: FileText,
      tint: "59,130,246",
      iconColor: "#60a5fa",
    },
    {
      label: "Open Cases",
      value: openCases,
      note: `${mockCases.length} cases in total`,
      icon: FolderOpen,
      tint: "245,158,11",
      iconColor: "#fbbf24",
    },
    {
      label: "Custody Events",
      value: mockCustodyLog.length,
      note: "Submit, access and verify entries",
      icon: Activity,
      tint: "16,185,129",
      iconColor: "#34d399",
    },
    {
      label: "Needs Attention",
      value: pendingCount + flaggedCount,
      note: `${pendingCount} pending, ${flaggedCount} flagged`,
      icon: TriangleAlert,
      tint: "239,68,68",
      iconColor: "#f87171",
    },
  ];

  const quickActions = [
    { to: "/upload", label: "Upload New Evidence", icon: Upload },
    { to: "/evidence", label: "Search Evidence", icon: Search },
    { to: "/custody", label: "View Custody Chain", icon: GitBranch },
  ];

  // Custody log rows point at evidence by CID; look the record up so the timeline can name the file.
  const evidenceForCid = (cid) => mockEvidence.find((ev) => ev.cid === cid);

  return (
    <div className="dfl-dash">
      <style>{DASHBOARD_CSS}</style>

      {/* Announces "Copied" / "Copy failed" to screen readers; empty (and silent) otherwise. */}
      <div role="status" aria-live="polite" style={visuallyHidden}>
        {copiedKey ? `Copied ${describeCopyKey(copiedKey)} to the clipboard.` : ""}
        {!copiedKey && failedKey ? `Could not copy ${describeCopyKey(failedKey)}.` : ""}
      </div>

      <header style={headerStyle}>
        <h1 className="dfl-dash-title" style={titleStyle}>
          Dashboard
        </h1>
        <p style={subtitleStyle}>Overview of digital evidence and the custody chain</p>
      </header>

      <ul style={statsGridStyle} role="list" aria-label="Summary">
        {stats.map(({ label, value, note, icon: Icon, tint, iconColor }) => (
          <li key={label} className="dfl-dash-card" style={cardStyle}>
            <div style={iconContainerStyle(tint)}>
              <Icon size={24} color={iconColor} aria-hidden="true" focusable="false" />
            </div>
            <p style={statNumberStyle}>{value}</p>
            <p style={statLabelStyle}>{label}</p>
            <p style={statNoteStyle}>{note}</p>
          </li>
        ))}
      </ul>

      <section className="dfl-dash-card" style={{ ...cardStyle, marginTop: "32px" }} aria-labelledby={evidenceHeadingId}>
        <div style={sectionHeaderStyle}>
          <h2 id={evidenceHeadingId} style={{ ...sectionTitleStyle, marginBottom: 0 }}>
            Recent Evidence Submissions
          </h2>
          <Link to="/evidence" style={viewAllLinkStyle}>
            View all evidence <ArrowRight size={14} aria-hidden="true" focusable="false" />
          </Link>
        </div>
        {/* A scrollable region must be reachable by keyboard so narrow-screen users can pan the table. */}
        <div style={tableScrollStyle} role="region" aria-label="Recent evidence table" tabIndex={0}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th scope="col" style={tableHeaderStyle}>CID</th>
                <th scope="col" style={tableHeaderStyle}>Case ID</th>
                <th scope="col" style={tableHeaderStyle}>File Name</th>
                <th scope="col" style={tableHeaderStyle}>Type</th>
                <th scope="col" style={tableHeaderStyle}>SHA-256</th>
                <th scope="col" style={tableHeaderStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentEvidence.map((ev) => (
                <tr key={ev.id} className="dfl-dash-row" style={tableRowStyle}>
                  <td style={{ ...tableCellStyle, fontFamily: MONO, color: LINK, fontSize: "13px" }}>
                    <span style={copyableValueStyle}>
                      <span title={ev.cid}>{ev.cid.slice(0, 20)}…</span>
                      <CopyButton
                        copyKey={`cid:${ev.id}`}
                        value={ev.cid}
                        label={`full CID for ${ev.id}`}
                        copiedKey={copiedKey}
                        failedKey={failedKey}
                        onCopy={handleCopy}
                      />
                    </span>
                  </td>
                  <td style={{ ...tableCellStyle, ...monoStyle }}>{ev.caseId}</td>
                  <td style={tableCellStyle}>{ev.fileName}</td>
                  <td style={tableCellStyle}>{ev.fileType}</td>
                  <td style={{ ...tableCellStyle, ...monoStyle }}>
                    <span style={copyableValueStyle}>
                      <span title={ev.hash}>{ev.hash.slice(0, 18)}…</span>
                      <CopyButton
                        copyKey={`hash:${ev.id}`}
                        value={ev.hash}
                        label={`full SHA-256 hash for ${ev.id}`}
                        copiedKey={copiedKey}
                        failedKey={failedKey}
                        onCopy={handleCopy}
                      />
                    </span>
                  </td>
                  <td style={tableCellStyle}>
                    <StatusBadge status={ev.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div style={timelineContainerStyle}>
        <section className="dfl-dash-card" style={cardStyle} aria-labelledby={custodyHeadingId}>
          <h2 id={custodyHeadingId} style={sectionTitleStyle}>
            Recent Custody Events
          </h2>
          <ul style={listResetStyle} role="list">
            {recentCustody.map((event) => {
              const evidence = evidenceForCid(event.cidHash);
              return (
                <li key={event.id} style={timelineEventStyle}>
                  <div>
                    <StatusBadge status={event.eventType} size="sm" />
                  </div>
                  <div style={{ fontSize: "13px", color: "#e2e8f0", overflowWrap: "anywhere" }}>
                    <span style={{ fontFamily: MONO, fontSize: "12px", color: MUTED }}>
                      {evidence ? evidence.id : `${event.cidHash.slice(0, 12)}…`}
                    </span>
                    {evidence ? ` ${evidence.fileName}` : ""}
                  </div>
                  <div style={{ fontSize: "12px", color: MUTED, overflowWrap: "anywhere" }}>
                    <span style={{ fontFamily: MONO }} title={event.actor}>
                      {truncateAddress(event.actor)}
                    </span>
                    {" · "}
                    {event.timestamp}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="dfl-dash-card" style={cardStyle} aria-labelledby={actionsHeadingId}>
          <h2 id={actionsHeadingId} style={sectionTitleStyle}>
            Quick Actions
          </h2>
          <ul style={listResetStyle} role="list">
            {quickActions.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="dfl-dash-action" style={actionLinkStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                    <Icon size={16} color={LINK} aria-hidden="true" focusable="false" />
                    {label}
                  </span>
                  <ArrowRight size={14} color={LINK} aria-hidden="true" focusable="false" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
