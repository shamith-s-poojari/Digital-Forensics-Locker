import { useState } from "react";
import StatusBadge from "../components/StatusBadge";
import { mockCases, mockEvidence, mockCustodyLog } from "../data/mockData";
import { exportCustodyReport } from "../utils/pdf";

export default function CaseManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedCase, setSelectedCase] = useState(null);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Case Management</h1>
          <p className="text-gray-400 text-sm mt-1">Overview of all investigations</p>
        </div>
        <div className="bg-blue-900 border border-blue-700 text-blue-400 px-3 py-1 rounded-lg text-sm font-semibold">
          {mockCases.length} Cases
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search cases by ID or title..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
      />

      {/* Status Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {["All", "Active", "Under Review", "Closed"].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              statusFilter === status
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Case Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredCases.map(caseData => (
          <div key={caseData.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="font-mono text-blue-400 text-sm">{caseData.id}</div>
              <StatusBadge status={caseData.status} />
            </div>
            <h3 className="text-white font-bold text-lg mb-3">{caseData.title}</h3>
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Investigating Officer</p>
                <p className="text-white font-mono">{caseData.officer.slice(0, 6)}...{caseData.officer.slice(-4)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Date Opened</p>
                <p className="text-white">{caseData.dateOpened}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Evidence Count</p>
                <p className="text-white">{caseData.evidenceCount}</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCase(caseData)}
              className="w-full border border-blue-500 text-blue-400 hover:bg-blue-900 px-4 py-2 rounded-lg text-sm font-semibold transition"
            >
              View Case
            </button>
          </div>
        ))}
      </div>

      {/* Case Detail Overlay */}
      {selectedCase && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-start justify-between">
              <div>
                <div className="font-mono text-blue-400 text-sm mb-2">{selectedCase.id}</div>
                <h2 className="text-white font-bold text-2xl">{selectedCase.title}</h2>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Case Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Status</p>
                  <StatusBadge status={selectedCase.status} />
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Date Opened</p>
                  <p className="text-white">{selectedCase.dateOpened}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-400 text-xs mb-1">Investigating Officer</p>
                  <p className="text-white font-mono">{selectedCase.officer}</p>
                </div>
              </div>

              {/* Evidence Table */}
              <div>
                <h3 className="text-white font-bold text-lg mb-3">Associated Evidence</h3>
                <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 bg-gray-900">
                        <th className="text-left py-3 px-3 text-gray-400 text-xs uppercase">IPFS CID</th>
                        <th className="text-left py-3 px-3 text-gray-400 text-xs uppercase">File</th>
                        <th className="text-left py-3 px-3 text-gray-400 text-xs uppercase">Type</th>
                        <th className="text-left py-3 px-3 text-gray-400 text-xs uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getCaseEvidence(selectedCase.id).map(ev => (
                        <tr key={ev.id} className="border-b border-gray-700 hover:bg-gray-700 transition">
                          <td className="py-3 px-3 font-mono text-blue-400 text-xs">{ev.cid.slice(0, 16)}...</td>
                          <td className="py-3 px-3 text-white text-xs">{ev.fileName}</td>
                          <td className="py-3 px-3 text-gray-400 text-xs">{ev.fileType}</td>
                          <td className="py-3 px-3"><StatusBadge status={ev.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleExportPDF(selectedCase)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
                >
                  Export PDF Report
                </button>
                <button
                  onClick={() => setSelectedCase(null)}
                  className="flex-1 border border-gray-600 text-gray-400 hover:bg-gray-800 px-4 py-2 rounded-lg font-semibold transition"
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
