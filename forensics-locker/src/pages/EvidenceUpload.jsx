// Performance fixes: native fetch + AbortController (no axios), 30s timeout via signal,
// 10 MB file-size gate before upload starts, multi-step uploadStatus feedback,
// and a simulated progress bar via setInterval (browser fetch has no real upload progress).
import { useState, useRef } from "react";
import { Upload, CheckCircle, AlertCircle, FileText, Loader, X } from "lucide-react";
import { computeSHA256, formatFileSize } from "../utils/hash";

export default function EvidenceUpload() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    caseId: "",
    caseTitle: "",
    evidenceType: "",
    description: "",
    ipfsCid: "",
  });

  // Separate state for the File object and hash result
  const [selectedFile, setSelectedFile] = useState(null);
  const [sha256Hash, setSha256Hash] = useState("");
  const [hashError, setHashError] = useState("");

  // Loading flags
  const [isComputingHash, setIsComputingHash] = useState(false);
  const [isUploadingIPFS, setIsUploadingIPFS] = useState(false);
  const [ipfsError, setIpfsError]             = useState("");
  const [uploadStatus, setUploadStatus]       = useState("");  // multi-step status text
  const [uploadProgress, setUploadProgress]   = useState(0);   // 0-100 for simulated bar
  const [isDragging, setIsDragging]           = useState(false);
  const [showSubmitModal, setShowSubmitModal]  = useState(false);

  const fileInputRef = useRef(null);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Core file-processing routine.
   * Sets the file in state, then computes SHA-256 via FileReader → Web Crypto API.
   */
  const processFile = async (file) => {
    // Reset previous hash / error whenever a new file is chosen
    setSelectedFile(file);
    setSha256Hash("");
    setHashError("");
    setIsComputingHash(true);

    try {
      const hash = await computeSHA256(file);
      setSha256Hash(hash);
    } catch (err) {
      setHashError(err.message ?? "Failed to compute hash. Please try again.");
      console.error("[EvidenceUpload] Hash computation failed:", err);
    } finally {
      setIsComputingHash(false);
    }
  };

  // ─── File input ──────────────────────────────────────────────────────────────

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset the input value so the same file can be re-selected after removal
    e.target.value = "";
  };

  // ─── Drag & Drop ─────────────────────────────────────────────────────────────

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    // Only clear when leaving the drop zone entirely (not a child element)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ─── IPFS Upload (native fetch + AbortController) ───────────────────────

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  /**
   * Uploads file to Pinata IPFS using native fetch with a 30-second AbortController
   * timeout. No external libraries — zero axios overhead.
   */
  const uploadToIPFS = async (file, signal) => {
    const body = new FormData();
    body.append("file", file);

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`,
        // Note: do NOT set Content-Type here — browser sets it with the boundary
      },
      body,
      signal, // AbortController signal for 30-second timeout
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const detail =
        payload?.error?.details ?? payload?.error ?? `HTTP ${res.status}`;
      throw new Error(String(detail));
    }

    const json = await res.json();
    return json.IpfsHash; // Pinata returns { IpfsHash, PinSize, Timestamp }
  };

  const handleUploadIPFS = async () => {
    if (!selectedFile) return;

    // ── 1. File size validation ──
    if (selectedFile.size > MAX_FILE_SIZE) {
      setIpfsError(
        "File too large. Maximum size is 10 MB. Please select a smaller file."
      );
      return;
    }

    // ── 2. Reset UI state ──
    setIsUploadingIPFS(true);
    setIpfsError("");
    setUploadProgress(0);
    setFormData((prev) => ({ ...prev, ipfsCid: "" }));

    // ── 3. Simulated progress bar (0 → 85% during upload, jumps to 100 on success) ──
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 6 + 2, 85);
      setUploadProgress(Math.round(progress));
    }, 400);

    // ── 4. 30-second AbortController timeout ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    setUploadStatus("Connecting to IPFS…");

    try {
      setUploadStatus("Uploading to Pinata IPFS… this may take a moment");
      const cid = await uploadToIPFS(selectedFile, controller.signal);

      // Success
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatus("Upload complete! CID received.");
      setFormData((prev) => ({ ...prev, ipfsCid: cid }));

      // Reset bar after 2 s
      setTimeout(() => setUploadProgress(0), 2000);
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(0);

      const message =
        err.name === "AbortError"
          ? "Upload timed out. Please check your connection or try a smaller file."
          : err.message ||
            "Upload to IPFS failed. Check your Pinata JWT and network connection.";

      setUploadStatus(`Upload failed: ${message}`);
      setIpfsError(message);
      console.error("[EvidenceUpload] Pinata upload failed:", err);
    } finally {
      clearTimeout(timeoutId);
      setIsUploadingIPFS(false);
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    setShowSubmitModal(true);
    setTimeout(() => {
      setShowSubmitModal(false);
      setCurrentStep(1);
      setFormData({ caseId: "", caseTitle: "", evidenceType: "", description: "", ipfsCid: "" });
      setSelectedFile(null);
      setSha256Hash("");
      setHashError("");
    }, 3000);
  };

  // ─── Derived flags ───────────────────────────────────────────────────────────

  /**
   * The "Next" button in Step 2 is only enabled when:
   * - A file has been selected
   * - Hashing is not in progress
   * - A hash was successfully computed (no error)
   * - The IPFS CID is available (after uploading)
   */
  const canProceedFromStep2 = !!formData.ipfsCid && !isComputingHash && !hashError;

  // ─── Styles ──────────────────────────────────────────────────────────────────

  const headerStyle = { marginBottom: "32px" };
  const titleStyle = { fontSize: "28px", fontWeight: 700, color: "#e2e8f0", marginBottom: "4px" };
  const subtitleStyle = { fontSize: "14px", color: "#94a3b8" };

  const stepsStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    marginBottom: "32px",
  };

  const stepCircleStyle = (isActive, isCompleted) => ({
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "15px",
    transition: "background 0.3s, box-shadow 0.3s",
    color: isActive || isCompleted ? "white" : "#64748b",
    background: isCompleted
      ? "#2563eb"
      : isActive
      ? "#3b82f6"
      : "rgba(51,65,85,0.8)",
    boxShadow: isActive ? "0 0 0 4px rgba(59,130,246,0.2)" : "none",
    border: isActive || isCompleted ? "none" : "1px solid #334155",
    flexShrink: 0,
  });

  const stepLineStyle = (isCompleted) => ({
    height: "3px",
    flex: 1,
    maxWidth: "80px",
    borderRadius: "2px",
    transition: "background 0.4s ease",
    background: isCompleted ? "#3b82f6" : "#1e293b",
    border: isCompleted ? "none" : "1px solid #334155",
  });

  const cardStyle = {
    background: "rgba(15,20,25,0.6)",
    border: "1px solid rgba(100,116,139,0.25)",
    borderRadius: "8px",
    padding: "32px",
  };

  const inputStyle = {
    width: "100%",
    background: "rgba(30,41,59,0.4)",
    border: "1px solid rgba(100,116,139,0.3)",
    color: "#e2e8f0",
    borderRadius: "6px",
    padding: "10px 12px",
    fontSize: "14px",
    fontFamily: "'Space Grotesk', sans-serif",
    outline: "none",
    marginBottom: "16px",
    transition: "all 0.2s",
    boxSizing: "border-box",
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: "120px",
    resize: "none",
  };

  const dropZoneStyle = {
    border: `2px dashed ${isDragging ? "#3b82f6" : "rgba(100,116,139,0.4)"}`,
    borderRadius: "8px",
    padding: "64px 32px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    marginBottom: "16px",
    background: isDragging ? "rgba(59,130,246,0.07)" : "rgba(30,41,59,0.2)",
  };

  const buttonStyle = (variant = "primary") =>
    ({
      primary: {
        width: "100%",
        background: "#3b82f6",
        color: "white",
        border: "none",
        borderRadius: "6px",
        padding: "10px 16px",
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s",
        marginTop: "12px",
      },
      secondary: {
        flex: 1,
        background: "transparent",
        border: "1px solid rgba(100,116,139,0.5)",
        color: "#60a5fa",
        borderRadius: "6px",
        padding: "10px 16px",
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s",
      },
    })[variant];

  const sectionTitleStyle = { fontSize: "16px", fontWeight: 600, color: "#e2e8f0", marginBottom: "20px" };

  const infoBoxStyle = (color) => ({
    background: `rgba(${color}, 0.08)`,
    border: `1px solid rgba(${color}, 0.3)`,
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "16px",
  });

  const hashBoxStyle = {
    background: "rgba(16,185,129,0.08)",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: "6px",
    padding: "12px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#10b981",
    wordBreak: "break-all",
    marginBottom: "16px",
  };

  const ciidBoxStyle = {
    background: "rgba(59,130,246,0.08)",
    border: "1px solid rgba(59,130,246,0.3)",
    borderRadius: "6px",
    padding: "12px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#3b82f6",
    wordBreak: "break-all",
    marginBottom: "16px",
  };

  const buttonGroupStyle = { display: "flex", gap: "12px", marginTop: "24px" };

  const modalOverlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  };

  const modalStyle = {
    background: "rgba(15,20,25,0.95)",
    border: "1px solid rgba(100,116,139,0.3)",
    borderRadius: "8px",
    padding: "40px",
    textAlign: "center",
    maxWidth: "400px",
  };

  const modalTitleStyle = { fontSize: "24px", fontWeight: 700, color: "#e2e8f0", marginBottom: "12px" };
  const modalTextStyle = {
    fontSize: "13px",
    color: "#94a3b8",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: "12px",
    wordBreak: "break-all",
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ── */}
      <div style={headerStyle}>
        <div style={titleStyle}>Evidence Upload</div>
        <div style={subtitleStyle}>Three-step evidence submission wizard</div>
      </div>

      {/* ── Step Indicator ── */}
      <div style={stepsStyle}>
        {/* Circle 1 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={stepCircleStyle(currentStep === 1, currentStep > 1)}>
            {currentStep > 1 ? "✓" : "1"}
          </div>
          <span style={{ fontSize: 10, color: currentStep >= 1 ? "#60a5fa" : "#475569", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Case</span>
        </div>

        <div style={stepLineStyle(currentStep >= 2)} />

        {/* Circle 2 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={stepCircleStyle(currentStep === 2, currentStep > 2)}>
            {currentStep > 2 ? "✓" : "2"}
          </div>
          <span style={{ fontSize: 10, color: currentStep >= 2 ? "#60a5fa" : "#475569", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Upload</span>
        </div>

        <div style={stepLineStyle(currentStep >= 3)} />

        {/* Circle 3 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={stepCircleStyle(currentStep === 3, false)}>
            3
          </div>
          <span style={{ fontSize: 10, color: currentStep >= 3 ? "#60a5fa" : "#475569", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Confirm</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          Step 1 — Case Information
      ══════════════════════════════════════════════════════════════ */}
      {currentStep === 1 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Step 1: Case Information</div>

          <input
            type="text"
            id="caseId"
            name="caseId"
            placeholder="Case ID"
            value={formData.caseId}
            onChange={handleInputChange}
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(100,116,139,0.3)")}
          />
          <input
            type="text"
            id="caseTitle"
            name="caseTitle"
            placeholder="Case Title"
            value={formData.caseTitle}
            onChange={handleInputChange}
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(100,116,139,0.3)")}
          />
          <select
            id="evidenceType"
            name="evidenceType"
            value={formData.evidenceType}
            onChange={handleInputChange}
            style={{ ...inputStyle, color: formData.evidenceType ? "#e2e8f0" : "#94a3b8" }}
            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(100,116,139,0.3)")}
          >
            <option value="">Select Evidence Type</option>
            <option value="Digital Image">Digital Image</option>
            <option value="Video">Video</option>
            <option value="Document">Document</option>
            <option value="Device Log">Device Log</option>
            <option value="Other">Other</option>
          </select>
          <textarea
            id="description"
            name="description"
            placeholder="Description"
            value={formData.description}
            onChange={handleInputChange}
            style={textareaStyle}
            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(100,116,139,0.3)")}
          />

          <button
            id="step1-next-btn"
            onClick={() => setCurrentStep(2)}
            style={buttonStyle("primary")}
            onMouseEnter={(e) => (e.target.style.background = "#2563eb")}
            onMouseLeave={(e) => (e.target.style.background = "#3b82f6")}
          >
            Next
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Step 2 — Upload Evidence File & Hash
      ══════════════════════════════════════════════════════════════ */}
      {currentStep === 2 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Step 2: Upload Evidence File</div>

          {/* ── Drop Zone ── */}
          <div
            id="drop-zone"
            role="button"
            aria-label="File drop zone — drag a file here or click to browse"
            tabIndex={0}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            style={dropZoneStyle}
          >
            <Upload
              size={48}
              style={{
                margin: "0 auto 16px",
                color: isDragging ? "#3b82f6" : "#8b949e",
                transition: "color 0.2s",
              }}
            />
            <div style={{ color: "#f0f6fc", fontWeight: 600, fontSize: "14px" }}>
              {isDragging ? "Drop to upload" : "Drag file here or click to select"}
            </div>
            <div style={{ color: "#8b949e", fontSize: "12px", marginTop: "6px" }}>
              All file types accepted
            </div>

            {/* Hidden file input — triggered programmatically */}
            <input
              ref={fileInputRef}
              id="fileInput"
              type="file"
              onChange={handleFileInputChange}
              style={{ display: "none" }}
              aria-hidden="true"
            />
          </div>

          {/* ── File Info ── */}
          {selectedFile && (
            <div style={infoBoxStyle("139,148,155")}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <FileText size={14} style={{ color: "#8b949e", flexShrink: 0 }} />
                <span style={{ fontSize: "13px", color: "#f0f6fc", wordBreak: "break-all" }}>
                  <strong>File:</strong> {selectedFile.name}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#8b949e", paddingLeft: "22px" }}>
                <strong>Size:</strong> {formatFileSize(selectedFile.size)}
              </div>
            </div>
          )}

          {/* ── Hash Panel ── */}
          <div
            style={{
              marginTop: "8px",
              padding: "20px",
              background: "rgba(30,41,59,0.4)",
              border: "1px solid rgba(100,116,139,0.3)",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", marginBottom: "12px" }}>
              Client-Side SHA-256 Hash
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "8px" }}>
              Computed in your browser using the Web Crypto API — no data leaves your device during hashing.
            </div>

            {/* Loading state */}
            {isComputingHash && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: "6px",
                  padding: "12px",
                  color: "#f59e0b",
                  fontSize: "13px",
                }}
              >
                <Loader
                  size={16}
                  style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
                />
                Calculating hash… this may take a moment for large files.
              </div>
            )}

            {/* Error state */}
            {hashError && !isComputingHash && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "6px",
                  padding: "12px",
                  color: "#f87171",
                  fontSize: "13px",
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
                <span>{hashError}</span>
              </div>
            )}

            {/* Success — hash result */}
            {sha256Hash && !isComputingHash && !hashError && (
              <div
                style={{
                  ...hashBoxStyle,
                  marginBottom: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "11px", color: "#6ee7b7", letterSpacing: "0.05em" }}>
                  SHA-256
                </span>
                {sha256Hash}
              </div>
            )}

            {/* Placeholder when no file has been selected yet */}
            {!selectedFile && !isComputingHash && (
              <div
                style={{
                  ...hashBoxStyle,
                  background: "rgba(100,116,139,0.08)",
                  border: "1px solid rgba(100,116,139,0.2)",
                  color: "#4b5563",
                  marginBottom: 0,
                  userSelect: "none",
                }}
              >
                Awaiting file selection…
              </div>
            )}
          </div>

          {/* ── IPFS Upload button ── only shown after hash is ready ── */}
          {sha256Hash && !isComputingHash && !hashError && (
            <button
              id="ipfs-upload-btn"
              onClick={handleUploadIPFS}
              disabled={isUploadingIPFS}
              style={{
                ...buttonStyle("primary"),
                opacity: isUploadingIPFS ? 0.6 : 1,
                cursor: isUploadingIPFS ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              onMouseEnter={(e) => !isUploadingIPFS && (e.currentTarget.style.background = "#2563eb")}
              onMouseLeave={(e) => !isUploadingIPFS && (e.currentTarget.style.background = "#3b82f6")}
            >
              {isUploadingIPFS ? (
                <><Loader size={15} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} /> Uploading…</>
              ) : (
                formData.ipfsCid ? "Re-upload to IPFS" : "Upload to IPFS"
              )}
            </button>
          )}

          {/* ── Progress bar ── */}
          {(isUploadingIPFS || uploadProgress > 0) && (
            <div style={{ marginTop: 12, marginBottom: 4 }}>
              <div style={{ width: "100%", height: 6, borderRadius: 3, backgroundColor: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${uploadProgress}%`,
                    borderRadius: 3,
                    background: uploadProgress === 100 ? "#22c55e" : "#3b82f6",
                    transition: "width 0.35s ease, background 0.3s",
                  }}
                />
              </div>
              {uploadStatus && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color:
                      uploadStatus.startsWith("Upload complete")
                        ? "#22c55e"
                        : uploadStatus.startsWith("Upload failed")
                        ? "#f87171"
                        : "#60a5fa",
                  }}
                >
                  {isUploadingIPFS && (
                    <Loader size={12} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                  )}
                  {uploadStatus}
                </div>
              )}
            </div>
          )}

          {/* ── IPFS CID result ── */}
          {formData.ipfsCid && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "8px" }}>
                <CheckCircle size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "#22c55e", fontWeight: 600 }}>Pinned to IPFS successfully</span>
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>IPFS Content Identifier (CID)</div>
              <div style={ciidBoxStyle} title={formData.ipfsCid}>{formData.ipfsCid}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
                View on gateway:{" "}
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${formData.ipfsCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#3b82f6", textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  gateway.pinata.cloud/ipfs/{formData.ipfsCid.slice(0, 16)}…
                </a>
              </div>
            </div>
          )}

          {/* ── IPFS upload error (dismissible) ── */}
          {ipfsError && !isUploadingIPFS && (
            <div
              style={{
                marginTop: "12px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
                backgroundColor: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8,
                padding: "12px",
                color: "#f87171",
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><strong>IPFS Upload Failed:</strong> {ipfsError}</span>
              </div>
              <button
                onClick={() => { setIpfsError(""); setUploadStatus(""); }}
                title="Dismiss error"
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", flexShrink: 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#fca5a5")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#f87171")}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* ── Navigation ── */}
          <div style={buttonGroupStyle}>
            <button
              id="step2-back-btn"
              onClick={() => setCurrentStep(1)}
              style={buttonStyle("secondary")}
              onMouseEnter={(e) => (e.target.style.background = "rgba(59,130,246,0.1)")}
              onMouseLeave={(e) => (e.target.style.background = "transparent")}
            >
              Back
            </button>
            <button
              id="step2-next-btn"
              onClick={() => setCurrentStep(3)}
              disabled={!canProceedFromStep2}
              title={
                isComputingHash
                  ? "Please wait — hash is being calculated"
                  : !sha256Hash
                  ? "Select a file and upload to IPFS first"
                  : !formData.ipfsCid
                  ? "Upload to IPFS first"
                  : undefined
              }
              style={{
                ...buttonStyle("primary"),
                flex: 1,
                opacity: canProceedFromStep2 ? 1 : 0.45,
                cursor: canProceedFromStep2 ? "pointer" : "not-allowed",
              }}
              onMouseEnter={(e) => canProceedFromStep2 && (e.target.style.background = "#2563eb")}
              onMouseLeave={(e) => canProceedFromStep2 && (e.target.style.background = "#3b82f6")}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Step 3 — Confirm & Submit
      ══════════════════════════════════════════════════════════════ */}
      {currentStep === 3 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Step 3: Confirm &amp; Submit</div>

          {/* Summary grid */}
          <div style={{ ...infoBoxStyle("139,148,155"), marginBottom: "24px" }}>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}
            >
              <div>
                <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px" }}>CASE ID</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: "#f0f6fc", fontSize: "13px" }}>
                  {formData.caseId}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px" }}>CASE TITLE</div>
                <div style={{ color: "#f0f6fc", fontSize: "13px" }}>{formData.caseTitle}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px" }}>EVIDENCE TYPE</div>
                <div style={{ color: "#f0f6fc", fontSize: "13px" }}>{formData.evidenceType}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px" }}>FILE NAME</div>
                <div style={{ color: "#f0f6fc", fontSize: "13px", wordBreak: "break-all" }}>
                  {selectedFile?.name}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px" }}>FILE SIZE</div>
                <div style={{ color: "#f0f6fc", fontSize: "13px" }}>
                  {selectedFile ? formatFileSize(selectedFile.size) : "—"}
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px" }}>DESCRIPTION</div>
              <div style={{ color: "#f0f6fc", fontSize: "13px" }}>{formData.description}</div>
            </div>
          </div>

          <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>SHA-256 Hash</div>
          <div style={hashBoxStyle}>{sha256Hash}</div>

          <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>IPFS CID</div>
          <div style={ciidBoxStyle}>{formData.ipfsCid}</div>

          <div style={buttonGroupStyle}>
            <button
              id="step3-back-btn"
              onClick={() => setCurrentStep(2)}
              style={buttonStyle("secondary")}
              onMouseEnter={(e) => (e.target.style.background = "rgba(59,130,246,0.1)")}
              onMouseLeave={(e) => (e.target.style.background = "transparent")}
            >
              Back
            </button>
            <button
              id="step3-submit-btn"
              onClick={handleSubmit}
              style={{ ...buttonStyle("primary"), flex: 1 }}
              onMouseEnter={(e) => (e.target.style.background = "#2563eb")}
              onMouseLeave={(e) => (e.target.style.background = "#3b82f6")}
            >
              Submit to Blockchain
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Success Modal
      ══════════════════════════════════════════════════════════════ */}
      {showSubmitModal && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <CheckCircle size={64} style={{ margin: "0 auto 16px", color: "#10b981" }} />
            <div style={modalTitleStyle}>Transaction Submitted!</div>
            <div style={modalTextStyle}>
              0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1
            </div>
            <div style={{ fontSize: "13px", color: "#8b949e", marginBottom: "16px" }}>Block: 7489201</div>
            <button
              id="modal-done-btn"
              onClick={() => setShowSubmitModal(false)}
              style={{ ...buttonStyle("primary"), width: "100%" }}
              onMouseEnter={(e) => (e.target.style.background = "#2563eb")}
              onMouseLeave={(e) => (e.target.style.background = "#3b82f6")}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Spinner keyframes injected inline — avoids needing a CSS file change */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
