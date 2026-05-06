import { useState } from "react";
import { Search, X } from "lucide-react";
import { mockCases, mockEvidence, mockCustodyLog } from "../data/mockData";
import { exportCustodyReport } from "../utils/pdf";

export default function CaseManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedCase, setSelectedCase] = useState(null);
  const [hoveredCardId, setHoveredCardId] = useState(null);
  const [hoveredTabId, setHoveredTabId] = useState(null);

  const filteredCases = mockCases.filter(c => {
    const matchesSearch = c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         c.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getCaseEvidence = (caseId) => mockEvidence.filter(e => e.caseId === caseId);

  const handleExportPDF = (caseData) => {
    const caseEvidence = getCaseEvidence(caseData.id);
    exportCustodyReport(caseData, caseEvidence, mockCustodyLog);
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "Active":
        return {
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          color: "#22c55e",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          dotColor: "#22c55e",
        };
      case "Under Review":
        return {
          backgroundColor: "rgba(234, 179, 8, 0.1)",
          color: "#eab308",
          border: "1px solid rgba(234, 179, 8, 0.3)",
          dotColor: "#eab308",
        };
      case "Closed":
        return {
          backgroundColor: "rgba(100, 116, 139, 0.1)",
          color: "#64748b",
          border: "1px solid rgba(100, 116, 139, 0.3)",
          dotColor: "#64748b",
        };
      default:
        return {
          backgroundColor: "rgba(100, 116, 139, 0.1)",
          color: "#64748b",
          border: "1px solid rgba(100, 116, 139, 0.3)",
          dotColor: "#64748b",
        };
    }
  };

  const getTabDotColor = (status) => {
    switch (status) {
      case "All":
        return "#3b82f6";
      case "Active":
        return "#22c55e";
      case "Under Review":
        return "#eab308";
      case "Closed":
        return "#64748b";
      default:
        return "#64748b";
    }
  };

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh", padding: "32px" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9" }}>Case Management</h1>
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
          <span style={{ textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "11px", fontWeight: 600 }}>Total</span>
          <span style={{ fontWeight: 700 }}>{mockCases.length}</span>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div style={{ position: "relative", marginBottom: "20px" }}>
        <Search
          size={18}
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#64748b",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          placeholder="Search by case ID or title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            backgroundColor: "#1e293b",
            border: "1px solid #475569",
            borderRadius: "8px",
            padding: "10px 16px 10px 40px",
            color: "#f1f5f9",
            fontSize: "14px",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "#3b82f6";
            e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "#475569";
            e.target.style.boxShadow = "none";
          }}
        />
      </div>

      {/* FILTER TABS */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
        {["All", "Active", "Under Review", "Closed"].map((status) => {
          const isActive = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.target.style.backgroundColor = "#334155";
                  e.target.style.color = "#cbd5e1";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.target.style.backgroundColor = "#1e293b";
                  e.target.style.color = "#94a3b8";
                }
              }}
              style={{
                padding: "6px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                border: isActive ? "1px solid #3b82f6" : "1px solid #334155",
                backgroundColor: isActive ? "#2563eb" : "#1e293b",
                color: isActive ? "#ffffff" : "#94a3b8",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: getTabDotColor(status) }}></span>
              {status}
            </button>
          );
        })}
      </div>

      {/* CASES GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        {filteredCases.length > 0 ? (
          filteredCases.map((caseData) => {
            const statusStyle = getStatusBadgeStyle(caseData.status);
            const isHovered = hoveredCardId === caseData.id;
            return (
              <div
                key={caseData.id}
                onMouseEnter={() => setHoveredCardId(caseData.id)}
                onMouseLeave={() => setHoveredCardId(null)}
                style={{
                  backgroundColor: "#1e293b",
                  border: isHovered ? "1px solid #3b82f6" : "1px solid #334155",
                  borderRadius: "12px",
                  overflow: "hidden",
                  transition: "border-color 0.2s",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* CARD TOP */}
                <div style={{ padding: "16px 20px" }}>
                  {/* Top row with ID and Status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#64748b" }}>{caseData.id}</div>
                    <div
                      style={{
                        backgroundColor: statusStyle.backgroundColor,
                        color: statusStyle.color,
                        border: statusStyle.border,
                        padding: "3px 10px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: statusStyle.dotColor }}></span>
                      {caseData.status}
                    </div>
                  </div>

                  {/* Case Title */}
                  <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#f1f5f9", margin: "8px 0" }}>
                    {caseData.title}
                  </h3>

                  {/* Info Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginTop: "12px" }}>
                    <div>
                      <p style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                        Officer
                      </p>
                      <p style={{ fontSize: "13px", color: "#e2e8f0", fontFamily: "monospace" }}>
                        {caseData.officer.slice(0, 8)}...{caseData.officer.slice(-6)}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                        Date Opened
                      </p>
                      <p style={{ fontSize: "13px", color: "#e2e8f0" }}>
                        {caseData.dateOpened}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                        Evidence
                      </p>
                      <p style={{ fontSize: "13px", color: "#e2e8f0" }}>
                        {caseData.evidenceCount} items
                      </p>
                    </div>
                  </div>
                </div>

                {/* CARD BOTTOM - View Case Button */}
                <button
                  onClick={() => setSelectedCase(caseData)}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#2563eb";
                    e.target.style.color = "#ffffff";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "#0f172a";
                    e.target.style.color = "#94a3b8";
                  }}
                  style={{
                    width: "100%",
                    padding: "10px",
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
                    transition: "all 0.2s",
                  }}
                >
                  View Case Details →
                </button>
              </div>
            );
          })
        ) : (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 16px", color: "#64748b", fontSize: "14px" }}>
            No cases match your search filters
          </div>
        )}
      </div>

      {/* CASE DETAIL MODAL */}
      {selectedCase && (
        <div
          style={{
            position: "fixed",
            inset: "0",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: "50",
            padding: "16px",
          }}
          onClick={() => setSelectedCase(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "700px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px",
                borderBottom: "1px solid #334155",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                position: "sticky",
                top: "0",
                backgroundColor: "#1e293b",
                zIndex: 10,
              }}
            >
              <div>
                <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                  {selectedCase.id}
                </div>
                <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9" }}>
                  {selectedCase.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  padding: "4px",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = "#94a3b8";
                }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: "24px" }}>
              {/* Case Metadata */}
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
                  Case Information
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                  <div>
                    <p style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px", fontWeight: 600 }}>
                      Status
                    </p>
                    <div
                      style={{
                        backgroundColor: getStatusBadgeStyle(selectedCase.status).backgroundColor,
                        color: getStatusBadgeStyle(selectedCase.status).color,
                        border: getStatusBadgeStyle(selectedCase.status).border,
                        padding: "3px 10px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: getStatusBadgeStyle(selectedCase.status).dotColor }}></span>
                      {selectedCase.status}
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px", fontWeight: 600 }}>
                      Date Opened
                    </p>
                    <p style={{ fontSize: "13px", color: "#e2e8f0", fontFamily: "monospace" }}>{selectedCase.dateOpened}</p>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <p style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px", fontWeight: 600 }}>
                      Investigating Officer
                    </p>
                    <p style={{ fontSize: "13px", color: "#e2e8f0", fontFamily: "monospace" }}>{selectedCase.officer}</p>
                  </div>
                </div>
              </div>

              {/* Evidence Table */}
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
                  Associated Evidence ({getCaseEvidence(selectedCase.id).length})
                </h3>
                <div style={{ border: "1px solid #334155", borderRadius: "8px", overflow: "hidden", backgroundColor: "#0f172a" }}>
                  <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #334155", backgroundColor: "#1e293b" }}>
                        <th style={{ textAlign: "left", padding: "12px", fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          IPFS CID
                        </th>
                        <th style={{ textAlign: "left", padding: "12px", fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          File Name
                        </th>
                        <th style={{ textAlign: "left", padding: "12px", fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Type
                        </th>
                        <th style={{ textAlign: "left", padding: "12px", fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {getCaseEvidence(selectedCase.id).length > 0 ? (
                        getCaseEvidence(selectedCase.id).map((ev) => (
                          <tr
                            key={ev.id}
                            style={{
                              borderBottom: "1px solid #334155",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <td style={{ padding: "12px", fontFamily: "monospace", color: "#3b82f6", fontSize: "12px" }}>
                              {ev.cid.slice(0, 12)}...
                            </td>
                            <td style={{ padding: "12px", color: "#e2e8f0", fontSize: "12px" }}>{ev.fileName}</td>
                            <td style={{ padding: "12px", color: "#94a3b8", fontSize: "12px" }}>{ev.fileType}</td>
                            <td style={{ padding: "12px" }}>
                              <span
                                style={{
                                  backgroundColor: ev.status === "Verified" ? "rgba(34, 197, 94, 0.1)" : "rgba(59, 130, 246, 0.1)",
                                  color: ev.status === "Verified" ? "#22c55e" : "#3b82f6",
                                  border: ev.status === "Verified" ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)",
                                  padding: "3px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                }}
                              >
                                {ev.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                            No evidence associated with this case
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => handleExportPDF(selectedCase)}
                  style={{
                    flex: "1",
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#1d4ed8";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "#2563eb";
                  }}
                >
                  Export PDF Report
                </button>
                <button
                  onClick={() => setSelectedCase(null)}
                  style={{
                    flex: "1",
                    backgroundColor: "transparent",
                    color: "#94a3b8",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: "1px solid #475569",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#1e293b";
                    e.target.style.color = "#e2e8f0";
                    e.target.style.borderColor = "#64748b";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "transparent";
                    e.target.style.color = "#94a3b8";
                    e.target.style.borderColor = "#475569";
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
