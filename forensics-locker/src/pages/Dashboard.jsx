import { Shield, FolderOpen, Activity, Database, TrendingUp, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { mockEvidence, mockCustodyLog } from "../data/mockData";

export default function Dashboard() {
  const headerStyle = {
    marginBottom: "32px",
  };

  const titleStyle = {
    fontSize: "28px",
    fontWeight: 700,
    color: "#f0f6fc",
    marginBottom: "4px",
  };

  const subtitleStyle = {
    fontSize: "14px",
    color: "#8b949e",
  };

  const liveIndicatorStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    color: "#10b981",
    marginTop: "12px",
  };

  const pulseStyle = {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#10b981",
    animation: "pulse 2s infinite",
  };

  const statsGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px",
    marginTop: "28px",
  };

  const cardStyle = {
    background: "#0d1117",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
    padding: "24px",
    transition: "all 0.2s",
    cursor: "default",
  };

  const statCardStyle = {
    ...cardStyle,
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
  };

  const statLabelStyle = {
    fontSize: "12px",
    color: "#8b949e",
    textTransform: "uppercase",
    letterSpacing: "1px",
  };

  const statChangeStyle = (color) => ({
    fontSize: "12px",
    color: color,
    marginTop: "12px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  });

  const sectionTitleStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#f0f6fc",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const viewAllLinkStyle = {
    fontSize: "13px",
    color: "#3b82f6",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
  };

  const tableHeaderStyle = {
    background: "rgba(255,255,255,0.02)",
    color: "#8b949e",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    textAlign: "left",
    fontWeight: 600,
  };

  const tableRowStyle = {
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    transition: "background 0.15s",
  };

  const tableCellStyle = {
    padding: "14px 16px",
    fontSize: "14px",
    color: "#f0f6fc",
  };

  const monoStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#8b949e",
  };

  const timelineContainerStyle = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginTop: "24px",
  };

  const timelineEventStyle = {
    display: "flex",
    gap: "12px",
    paddingBottom: "16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  };

  const timelineDotStyle = (color) => ({
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: color,
    marginTop: "4px",
    flexShrink: 0,
  });

  const quickActionsStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "0",
  };

  const actionButtonStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    background: "transparent",
    border: "none",
    color: "#f0f6fc",
    cursor: "pointer",
    transition: "all 0.2s",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 500,
  };

  const getEventColor = (eventType) => {
    const colors = {
      Submit: "#10b981",
      Access: "#3b82f6",
      Verify: "#f59e0b",
      Transfer: "#8b5cf6",
    };
    return colors[eventType] || "#8b949e";
  };

  const recentEvidence = mockEvidence.slice(0, 5);
  const recentCustody = mockCustodyLog.slice(0, 4);

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Page Header */}
      <div style={headerStyle}>
        <div style={titleStyle}>Dashboard</div>
        <div style={subtitleStyle}>Real-time overview of digital evidence and custody chain</div>
        <div style={liveIndicatorStyle}>
          <div style={pulseStyle}></div>
          Live · Sepolia Testnet
        </div>
      </div>

      {/* Stat Cards */}
      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <div style={iconContainerStyle("59,130,246")}>
            <Shield size={24} style={{ color: "#3b82f6" }} />
          </div>
          <div style={statNumberStyle}>142</div>
          <div style={statLabelStyle}>Total Evidence</div>
          <div style={statChangeStyle("#10b981")}>
            <TrendingUp size={14} /> 12 this week
          </div>
        </div>

        <div style={statCardStyle}>
          <div style={iconContainerStyle("245,158,11")}>
            <FolderOpen size={24} style={{ color: "#f59e0b" }} />
          </div>
          <div style={statNumberStyle}>23</div>
          <div style={statLabelStyle}>Open Cases</div>
          <div style={statChangeStyle("#f59e0b")}>4 updated today</div>
        </div>

        <div style={statCardStyle}>
          <div style={iconContainerStyle("16,185,129")}>
            <Activity size={24} style={{ color: "#10b981" }} />
          </div>
          <div style={statNumberStyle}>8</div>
          <div style={statLabelStyle}>Events Today</div>
          <div style={statChangeStyle("#10b981")}>Latest entries</div>
        </div>

        <div style={statCardStyle}>
          <div style={iconContainerStyle("139,92,246")}>
            <Database size={24} style={{ color: "#8b5cf6" }} />
          </div>
          <div style={statNumberStyle}>4.2 GB</div>
          <div style={statLabelStyle}>Storage Used</div>
          <div style={statChangeStyle("#8b5cf6")}>142 files</div>
        </div>
      </div>

      {/* Recent Evidence */}
      <div
        style={{
          ...cardStyle,
          marginTop: "32px",
        }}
      >
        <div style={sectionTitleStyle}>
          <span>Recent Evidence Submissions</span>
          <Link to="/evidence" style={viewAllLinkStyle}>
            View All <ExternalLink size={14} />
          </Link>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>CID (IPFS)</th>
              <th style={tableHeaderStyle}>Case ID</th>
              <th style={tableHeaderStyle}>File Name</th>
              <th style={tableHeaderStyle}>Type</th>
              <th style={tableHeaderStyle}>SHA-256</th>
              <th style={tableHeaderStyle}>Storage Location</th>
              <th style={tableHeaderStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentEvidence.map((ev) => (
              <tr key={ev.id} style={tableRowStyle}>
                <td style={{ ...tableCellStyle, ...monoStyle, color: "#3b82f6" }}>{ev.cid.slice(0, 20)}...</td>
                <td style={{ ...tableCellStyle, ...monoStyle }}>{ev.caseId}</td>
                <td style={tableCellStyle}>{ev.fileName}</td>
                <td style={tableCellStyle}>{ev.fileType}</td>
                <td style={{ ...tableCellStyle, ...monoStyle }} title={ev.hash}>
                  {ev.hash.slice(0, 18)}...
                </td>
                <td style={{ ...tableCellStyle, ...monoStyle, fontSize: "12px" }}>IPFS Network</td>
                <td style={tableCellStyle}>
                  <StatusBadge status={ev.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Timeline and Quick Actions */}
      <div style={timelineContainerStyle}>
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Recent Custody Events</div>
          {recentCustody.map((event) => (
            <div key={event.id} style={timelineEventStyle}>
              <div style={timelineDotStyle(getEventColor(event.eventType))}></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#f0f6fc", marginBottom: "4px" }}>
                  {event.eventType}
                </div>
                <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "2px" }}>
                  <span style={monoStyle}>{event.evidenceId}</span>
                </div>
                <div style={{ fontSize: "11px", color: "#484f58" }}>{event.timestamp}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Quick Actions</div>
          <div style={quickActionsStyle}>
            <Link to="/upload" style={actionButtonStyle} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <span>📤 Upload New Evidence</span>
              <ExternalLink size={14} style={{ color: "#3b82f6" }} />
            </Link>
            <Link to="/evidence" style={actionButtonStyle} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <span>🔍 Search Evidence</span>
              <ExternalLink size={14} style={{ color: "#3b82f6" }} />
            </Link>
            <Link to="/custody" style={actionButtonStyle} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <span>⛓️ View Custody Chain</span>
              <ExternalLink size={14} style={{ color: "#3b82f6" }} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
