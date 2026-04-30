import { useState } from "react";
import { X, Copy, CheckCircle, AlertCircle } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { mockEvidence, mockCases, mockCustodyLog } from "../data/mockData";
import { computeSHA256 } from "../utils/hash";
import { exportCustodyReport } from "../utils/pdf";

export default function EvidenceViewer() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const filteredEvidence = mockEvidence.filter(ev => {
    const matchesSearch = ev.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ev.caseId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ev.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ev.submittedBy.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || ev.status === statusFilter;
    const matchesType = typeFilter === "All" || ev.fileType === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

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
      setVerificationResult({
        matches: computedHash === selectedEvidence.hash,
        computedHash,
        storedHash: selectedEvidence.hash
      });
    } catch (error) {
      console.error("Error verifying:", error);
    }
    setIsVerifying(false);
  };

  const handleVerifyFile = (e) => {
    const file = e.target.files?.[0];
    if (file) handleVerify(file);
  };

  const handleExportPDF = () => {
    const caseData = mockCases.find(c => c.id === selectedEvidence.caseId);
    const caseEvidence = mockEvidence.filter(e => e.caseId === selectedEvidence.caseId);
    if (caseData) {
      exportCustodyReport(caseData, caseEvidence, mockCustodyLog);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Evidence Viewer</h1>
        <p className="text-gray-400 text-sm mt-1">Search and verify digital evidence</p>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Search by file name, case ID, evidence ID, or officer..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option>All</option>
            <option>Verified</option>
            <option>Pending</option>
            <option>Flagged</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option>All</option>
            <option>Digital Image</option>
            <option>Video</option>
            <option>Document</option>
            <option>Device Log</option>
          </select>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-800">
              <th className="text-left py-3 px-4">IPFS CID</th>
              <th className="text-left py-3 px-4">Case ID</th>
              <th className="text-left py-3 px-4">File Name</th>
              <th className="text-left py-3 px-4">Type</th>
              <th className="text-left py-3 px-4">SHA-256</th>
              <th className="text-left py-3 px-4">Internal ID</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvidence.map((ev) => (
              <tr key={ev.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                <td className="py-3 px-4 font-mono text-blue-400 text-xs">{ev.cid.slice(0, 16)}...</td>
                <td className="py-3 px-4 font-mono text-gray-400 text-xs">{ev.caseId}</td>
                <td className="py-3 px-4 text-white text-sm">{ev.fileName}</td>
                <td className="py-3 px-4 text-gray-400 text-xs">{ev.fileType}</td>
                <td className="py-3 px-4 font-mono text-gray-500 text-xs">{ev.hash.slice(0, 12)}...</td>
                <td className="py-3 px-4 font-mono text-gray-500 text-xs">{ev.id}</td>
                <td className="py-3 px-4"><StatusBadge status={ev.status} /></td>
                <td className="py-3 px-4 space-x-2">
                  <button
                    onClick={() => {
                      setSelectedEvidence(ev);
                      setVerificationResult(null);
                    }}
                    className="border border-blue-500 text-blue-400 hover:bg-blue-900 px-2 py-1 rounded text-xs transition"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => {
                      setSelectedEvidence(ev);
                      setVerifyModalOpen(true);
                    }}
                    className="border border-gray-600 text-gray-400 hover:bg-gray-700 px-2 py-1 rounded text-xs transition"
                  >
                    Verify
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Panel */}
      {selectedEvidence && !verifyModalOpen && (
        <div className="fixed right-0 top-0 h-screen w-96 bg-gray-900 border-l border-gray-800 p-6 z-50 shadow-2xl overflow-y-auto">
          <button
            onClick={() => setSelectedEvidence(null)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>

          <h2 className="text-white font-bold text-lg mb-4">Evidence Details</h2>

          <div className="space-y-4">
            <div>
              <p className="text-gray-400 text-xs">Evidence ID</p>
              <p className="text-white font-mono text-sm">{selectedEvidence.id}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Case ID</p>
              <p className="text-white font-mono text-sm">{selectedEvidence.caseId}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">File Name</p>
              <p className="text-white text-sm">{selectedEvidence.fileName}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Type</p>
              <p className="text-white text-sm">{selectedEvidence.fileType}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Submitted By</p>
              <p className="text-white font-mono text-sm">{selectedEvidence.submittedBy.slice(0, 6)}...{selectedEvidence.submittedBy.slice(-4)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Timestamp</p>
              <p className="text-white text-sm">{selectedEvidence.timestamp}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Status</p>
              <p className="mt-1"><StatusBadge status={selectedEvidence.status} /></p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-2">SHA-256 Hash</p>
              <div className="bg-green-950 border border-green-800 text-green-400 font-mono text-xs p-2 rounded break-all">
                {selectedEvidence.hash}
              </div>
              <button
                onClick={handleCopyHash}
                className="mt-2 flex items-center gap-2 text-green-400 text-xs hover:text-green-300 transition"
              >
                <Copy size={14} /> {copiedHash ? "Copied!" : "Copy"}
              </button>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-2">IPFS CID</p>
              <a
                href={"https://ipfs.io/ipfs/" + selectedEvidence.cid}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 font-mono text-xs break-all hover:text-blue-300 transition"
              >
                {selectedEvidence.cid}
              </a>
            </div>

            <button
              onClick={handleExportPDF}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition text-sm"
            >
              Export PDF
            </button>
          </div>
        </div>
      )}

      {/* Verify Modal */}
      {verifyModalOpen && selectedEvidence && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-white font-bold text-lg mb-4">Verify Evidence File</h2>
            
            {!verificationResult && (
              <div>
                <p className="text-gray-400 text-sm mb-4">Select the file to verify against stored hash:</p>
                <input
                  type="file"
                  onChange={handleVerifyFile}
                  disabled={isVerifying}
                  className="w-full"
                />
                {isVerifying && <p className="text-yellow-400 text-sm mt-4">Verifying...</p>}
              </div>
            )}

            {verificationResult && (
              <div>
                {verificationResult.matches ? (
                  <div className="flex items-start gap-3">
                    <CheckCircle size={32} className="text-green-400 flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-green-400 font-semibold">Hash Verified — File Intact</p>
                      <p className="text-gray-400 text-xs mt-2">The file hash matches the stored hash exactly.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <AlertCircle size={32} className="text-red-400 flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-red-400 font-semibold">Hash Mismatch — Possible Tampering Detected</p>
                      <p className="text-gray-400 text-xs mt-2">The file hash does not match the stored hash.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => {
                setVerifyModalOpen(false);
                setVerificationResult(null);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
