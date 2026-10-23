// Evidence upload wizard (DEMO).
//
// Behaviour:
//  - The SHA-256 of the chosen file is computed locally in the browser (Web Crypto).
//  - The user can optionally pin the file to IPFS. The browser posts it to /api/pin; the server-side proxy
//    (server/pinataProxy.js) holds the Pinata JWT, so no API secret ships in the bundle. Pinned files are
//    PUBLIC and unencrypted, which the UI says plainly.
//  - "Submit" records nothing on a blockchain; it only shows a dismissible demo-only message.
import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, AlertCircle, FileText, Loader, X, Info, Copy, Check, CloudUpload } from "lucide-react";
import { computeSHA256, formatFileSize } from "../utils/hash";
import { uploadToIPFS } from "../utils/ipfs";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB: the whole file is read into memory to hash it.
const CID_PLACEHOLDER = "Not uploaded";
const INITIAL_FORM = { caseId: "", caseTitle: "", evidenceType: "", description: "" };

// Visually hidden but available to assistive technology (no CSS file needed).
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

const NOT_PROVIDED = <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>;

function SummaryItem({ label, children, mono = false, breakAll = false }) {
  return (
    <div>
      <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          color: "#f0f6fc",
          fontSize: "13px",
          fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
          wordBreak: breakAll ? "break-all" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function EvidenceUpload() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_FORM);

  // The File object and its locally computed hash.
  const [selectedFile, setSelectedFile] = useState(null);
  const [sha256Hash, setSha256Hash] = useState("");
  const [hashError, setHashError] = useState("");
  const [isComputingHash, setIsComputingHash] = useState(false);

  // IPFS pinning (optional): the CID is set only after the proxy confirms the pin.
  const [cid, setCid] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadControllerRef = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);

  const fileInputRef = useRef(null);
  const headingRef = useRef(null);
  const dismissButtonRef = useRef(null);
  // Incremented whenever the file changes or is removed, so a slow hash of an old file
  // can never overwrite the state of the current one.
  const hashRequestRef = useRef(0);

  const { copiedKey, copy } = useCopyToClipboard();

  // --- Form -------------------------------------------------------------------

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // --- File + hash ------------------------------------------------------------

  /** Cancels any in-flight upload and forgets the CID (it belonged to the previous file). */
  const resetUpload = useCallback(() => {
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    setCid("");
    setIsUploading(false);
    setUploadError("");
  }, []);

  const clearFile = useCallback(() => {
    hashRequestRef.current += 1;
    resetUpload();
    setSelectedFile(null);
    setSha256Hash("");
    setHashError("");
    setIsComputingHash(false);
  }, [resetUpload]);

  // Abort a pending upload if the page is left.
  useEffect(() => () => uploadControllerRef.current?.abort(), []);

  /** Stores the chosen file, drops any previous hash/error/CID, then hashes it locally. */
  const processFile = async (file) => {
    hashRequestRef.current += 1;
    const requestId = hashRequestRef.current;

    resetUpload();
    setSelectedFile(file);
    setSha256Hash("");
    setHashError("");

    if (file.size > MAX_FILE_SIZE) {
      setIsComputingHash(false);
      setHashError(
        `This file is ${formatFileSize(file.size)}. The demo reads the whole file into memory to compute its ` +
          `SHA-256, so the limit is ${formatFileSize(MAX_FILE_SIZE)}. Choose a smaller file.`
      );
      return;
    }

    setIsComputingHash(true);
    try {
      const hash = await computeSHA256(file);
      if (requestId === hashRequestRef.current) setSha256Hash(hash);
    } catch (err) {
      if (requestId === hashRequestRef.current) {
        setHashError(err?.message || "Failed to compute the hash. Please try again.");
      }
    } finally {
      if (requestId === hashRequestRef.current) setIsComputingHash(false);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so the same file can be chosen again after it was removed.
    e.target.value = "";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    // Only clear when leaving the drop zone entirely (not when entering a child element).
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

  const handleDropZoneKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFilePicker();
    }
  };

  // --- IPFS upload (through the server-side proxy) ----------------------------

  const handleUploadIPFS = async () => {
    if (!selectedFile || isUploading) return;

    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setIsUploading(true);
    setUploadError("");
    setCid("");

    try {
      const pinnedCid = await uploadToIPFS(selectedFile, { signal: controller.signal });
      if (uploadControllerRef.current === controller) setCid(pinnedCid);
    } catch (err) {
      if (controller.signal.aborted) return; // the file changed or the page was left
      setUploadError(err?.message || "Upload to IPFS failed. Please try again.");
    } finally {
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null;
        setIsUploading(false);
      }
    }
  };

  // --- Submit (demo only) -----------------------------------------------------

  const handleSubmit = () => {
    setShowDemoModal(true);
  };

  /** Dismisses the demo message and starts a fresh wizard. */
  const closeDemoModal = useCallback(() => {
    clearFile();
    setFormData(INITIAL_FORM);
    setCurrentStep(1);
    setShowDemoModal(false);
  }, [clearFile]);

  // Modal behaviour: move focus in, keep it in, close on Escape, give focus back afterwards.
  useEffect(() => {
    if (!showDemoModal) return undefined;

    const previouslyFocused = document.activeElement;
    const heading = headingRef.current;
    dismissButtonRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDemoModal();
      } else if (e.key === "Tab") {
        // The dialog has a single focusable control, so keep focus on it.
        e.preventDefault();
        dismissButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      } else {
        heading?.focus();
      }
    };
  }, [showDemoModal, closeDemoModal]);

  // --- Derived flags ----------------------------------------------------------

  /** Step 2 can continue only with a file whose SHA-256 was computed successfully. */
  const canProceedFromStep2 = Boolean(selectedFile) && Boolean(sha256Hash) && !isComputingHash && !hashError;

  const step2Hint = isComputingHash
    ? "Please wait: the hash is being calculated."
    : hashError
    ? "Fix the file problem above before continuing."
    : "Select a file to compute its SHA-256 before continuing.";

  // --- Styles -----------------------------------------------------------------

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
    color: isActive || isCompleted ? "white" : "#94a3b8",
    background: isCompleted ? "#2563eb" : isActive ? "#3b82f6" : "rgba(51,65,85,0.8)",
    boxShadow: isActive ? "0 0 0 4px rgba(59,130,246,0.2)" : "none",
    border: isActive || isCompleted ? "none" : "1px solid #334155",
    flexShrink: 0,
  });

  const stepLabelStyle = (isReached) => ({
    fontSize: 10,
    color: isReached ? "#60a5fa" : "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontWeight: 600,
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

  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#cbd5e1",
    marginBottom: "6px",
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
    // Transparent (not "none") so the outline still shows in forced-colors / high-contrast mode.
    outline: "2px solid transparent",
    marginBottom: "16px",
    transition: "all 0.2s",
    boxSizing: "border-box",
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: "120px",
    resize: "none",
  };

  // Visible focus replacement for the transparent outline above: brighter border plus a ring.
  const focusHandlers = {
    onFocus: (e) => {
      e.currentTarget.style.borderColor = "#60a5fa";
      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(96,165,250,0.35)";
    },
    onBlur: (e) => {
      e.currentTarget.style.borderColor = "rgba(100,116,139,0.3)";
      e.currentTarget.style.boxShadow = "none";
    },
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

  const hoverHandlers = (rest, hover) => ({
    onMouseEnter: (e) => {
      if (!e.currentTarget.disabled) e.currentTarget.style.background = hover;
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.background = rest;
    },
  });
  const primaryHover = hoverHandlers("#3b82f6", "#2563eb");
  const secondaryHover = hoverHandlers("transparent", "rgba(59,130,246,0.1)");

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

  const cidBoxStyle = {
    background: "rgba(100,116,139,0.08)",
    border: "1px solid rgba(100,116,139,0.25)",
    borderRadius: "6px",
    padding: "12px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#94a3b8",
    wordBreak: "break-all",
    marginBottom: "16px",
  };

  const copyButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "transparent",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: "4px",
    color: "#6ee7b7",
    fontSize: "11px",
    fontFamily: "'Space Grotesk', sans-serif",
    padding: "2px 8px",
    cursor: "pointer",
  };

  const buttonGroupStyle = { display: "flex", gap: "12px", marginTop: "24px" };

  const modalOverlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  };

  const modalStyle = {
    background: "rgba(15,20,25,0.95)",
    border: "1px solid rgba(100,116,139,0.3)",
    borderRadius: "8px",
    padding: "40px",
    textAlign: "center",
    maxWidth: "420px",
    margin: "16px",
  };

  const modalTitleStyle = { fontSize: "24px", fontWeight: 700, color: "#e2e8f0", marginBottom: "12px" };

  // --- Render -----------------------------------------------------------------

  const isHashReady = Boolean(sha256Hash) && !isComputingHash && !hashError;

  return (
    <div>
      {/* Header */}
      <div style={headerStyle}>
        <h1 ref={headingRef} tabIndex={-1} style={titleStyle}>
          Evidence Upload
        </h1>
        <div style={subtitleStyle}>Three-step evidence submission wizard (demo: nothing is uploaded or recorded)</div>
      </div>

      {/* Step indicator */}
      <div role="group" aria-label={`Progress: step ${currentStep} of 3`} style={stepsStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={stepCircleStyle(currentStep === 1, currentStep > 1)} aria-current={currentStep === 1 ? "step" : undefined}>
            {currentStep > 1 ? "✓" : "1"}
          </div>
          <span style={stepLabelStyle(currentStep >= 1)}>Case</span>
        </div>

        <div style={stepLineStyle(currentStep >= 2)} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={stepCircleStyle(currentStep === 2, currentStep > 2)} aria-current={currentStep === 2 ? "step" : undefined}>
            {currentStep > 2 ? "✓" : "2"}
          </div>
          <span style={stepLabelStyle(currentStep >= 2)}>Hash</span>
        </div>

        <div style={stepLineStyle(currentStep >= 3)} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={stepCircleStyle(currentStep === 3, false)} aria-current={currentStep === 3 ? "step" : undefined}>
            3
          </div>
          <span style={stepLabelStyle(currentStep >= 3)}>Confirm</span>
        </div>
      </div>

      {/* Step 1: case information */}
      {currentStep === 1 && (
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Step 1: Case Information</h2>

          <label htmlFor="caseId" style={labelStyle}>
            Case ID
          </label>
          <input
            type="text"
            id="caseId"
            name="caseId"
            placeholder="e.g. CASE-2025-0042"
            value={formData.caseId}
            onChange={handleInputChange}
            style={inputStyle}
            {...focusHandlers}
          />

          <label htmlFor="caseTitle" style={labelStyle}>
            Case Title
          </label>
          <input
            type="text"
            id="caseTitle"
            name="caseTitle"
            placeholder="Short descriptive title"
            value={formData.caseTitle}
            onChange={handleInputChange}
            style={inputStyle}
            {...focusHandlers}
          />

          <label htmlFor="evidenceType" style={labelStyle}>
            Evidence Type
          </label>
          <select
            id="evidenceType"
            name="evidenceType"
            value={formData.evidenceType}
            onChange={handleInputChange}
            className="evidence-select"
            style={{
              ...inputStyle,
              backgroundColor: "rgba(15, 23, 42, 0.9)",
              color: formData.evidenceType ? "#e2e8f0" : "#94a3b8",
              cursor: "pointer",
            }}
            {...focusHandlers}
          >
            <option value="">Select Evidence Type</option>
            <option value="Digital Image">Digital Image</option>
            <option value="Video">Video</option>
            <option value="Document">Document</option>
            <option value="Device Log">Device Log</option>
            <option value="Other">Other</option>
          </select>

          <label htmlFor="description" style={labelStyle}>
            Description
          </label>
          <textarea
            id="description"
            name="description"
            placeholder="What is this evidence and how was it obtained?"
            value={formData.description}
            onChange={handleInputChange}
            style={textareaStyle}
            {...focusHandlers}
          />

          <button id="step1-next-btn" type="button" onClick={() => setCurrentStep(2)} style={buttonStyle("primary")} {...primaryHover}>
            Next
          </button>
        </div>
      )}

      {/* Step 2: choose file and compute its SHA-256 locally */}
      {currentStep === 2 && (
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Step 2: Choose Evidence File</h2>

          {/* Pinning to IPFS is optional and public: say so before the user can click it */}
          <div
            role="note"
            style={{
              ...infoBoxStyle("245,158,11"),
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              color: "#fde68a",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            <Info size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: "2px", color: "#fbbf24" }} />
            <span>
              Uploading pins the file to the <strong>public</strong> IPFS network via Pinata. Anyone who has the CID can
              read it, and it is not encrypted. Do not upload real evidence or sensitive data from this demo.
            </span>
          </div>

          {/* Drop zone */}
          <div
            id="drop-zone"
            role="button"
            aria-label="Choose evidence file: drag a file here, or press Enter to browse"
            tabIndex={0}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={openFilePicker}
            onKeyDown={handleDropZoneKeyDown}
            style={dropZoneStyle}
          >
            <Upload
              size={48}
              aria-hidden="true"
              style={{
                margin: "0 auto 16px",
                color: isDragging ? "#3b82f6" : "#8b949e",
                transition: "color 0.2s",
              }}
            />
            <div style={{ color: "#f0f6fc", fontWeight: 600, fontSize: "14px" }}>
              {isDragging ? "Drop to hash this file" : "Drag file here or click to select"}
            </div>
            <div style={{ color: "#8b949e", fontSize: "12px", marginTop: "6px" }}>
              All file types accepted (up to {formatFileSize(MAX_FILE_SIZE)}). The file leaves your browser only if you choose
              &ldquo;Upload to IPFS&rdquo;.
            </div>
          </div>

          {/* Real file input, opened from the drop zone; labelled for assistive technology */}
          <label htmlFor="fileInput" style={visuallyHidden}>
            Evidence file
          </label>
          <input ref={fileInputRef} id="fileInput" type="file" onChange={handleFileInputChange} style={{ display: "none" }} />

          {/* File info */}
          {selectedFile && (
            <div style={infoBoxStyle("139,148,155")}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <FileText size={14} aria-hidden="true" style={{ color: "#8b949e", flexShrink: 0 }} />
                <span style={{ fontSize: "13px", color: "#f0f6fc", wordBreak: "break-all", flex: 1 }}>
                  <strong>File:</strong> {selectedFile.name}
                </span>
                <button
                  type="button"
                  onClick={clearFile}
                  aria-label={`Remove selected file ${selectedFile.name}`}
                  title="Remove file"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e8f0")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div style={{ fontSize: "13px", color: "#8b949e", paddingLeft: "22px" }}>
                <strong>Size:</strong> {formatFileSize(selectedFile.size)}
              </div>
            </div>
          )}

          {/* Hash panel */}
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
              Computed in your browser using the Web Crypto API; hashing sends nothing anywhere. The hash is not stored or
              registered anywhere in this demo.
            </div>

            {isComputingHash && (
              <div
                role="status"
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
                <Loader size={16} aria-hidden="true" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                Calculating hash&hellip; this may take a moment for large files.
              </div>
            )}

            {hashError && !isComputingHash && (
              <div
                role="alert"
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
                <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: "1px" }} />
                <span>{hashError}</span>
              </div>
            )}

            {isHashReady && (
              <div style={{ ...hashBoxStyle, marginBottom: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#6ee7b7", letterSpacing: "0.05em" }}>SHA-256</span>
                  <button
                    type="button"
                    onClick={() => copy(sha256Hash, "sha256")}
                    aria-label="Copy SHA-256 hash"
                    style={copyButtonStyle}
                  >
                    {copiedKey === "sha256" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                    {copiedKey === "sha256" ? "Copied" : "Copy"}
                  </button>
                </span>
                <span style={visuallyHidden} role="status">
                  {copiedKey === "sha256" ? "SHA-256 hash copied to clipboard" : ""}
                </span>
                {sha256Hash}
              </div>
            )}

            {!selectedFile && !isComputingHash && (
              <div
                style={{
                  ...hashBoxStyle,
                  background: "rgba(100,116,139,0.08)",
                  border: "1px solid rgba(100,116,139,0.2)",
                  color: "#94a3b8",
                  marginBottom: 0,
                  userSelect: "none",
                }}
              >
                Awaiting file selection&hellip;
              </div>
            )}
          </div>

          {/* IPFS upload (optional) */}
          <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>IPFS CID</div>
          <div style={cidBoxStyle}>
            {cid ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ wordBreak: "break-all" }}>{cid}</span>
                <button
                  type="button"
                  onClick={() => copy(cid, "cid")}
                  aria-label="Copy IPFS CID"
                  style={copyButtonStyle}
                >
                  {copiedKey === "cid" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                  {copiedKey === "cid" ? "Copied" : "Copy"}
                </button>
              </span>
            ) : (
              CID_PLACEHOLDER
            )}
          </div>
          <span style={visuallyHidden} role="status">
            {copiedKey === "cid" ? "IPFS CID copied to clipboard" : ""}
          </span>

          {isUploading && (
            <div
              role="status"
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
                marginBottom: "12px",
              }}
            >
              <Loader size={16} aria-hidden="true" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
              Uploading to IPFS&hellip; this may take a moment.
            </div>
          )}

          {uploadError && !isUploading && (
            <div
              role="alert"
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
                marginBottom: "12px",
              }}
            >
              <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: "1px" }} />
              <span>{uploadError}</span>
            </div>
          )}

          <button
            id="upload-ipfs-btn"
            type="button"
            onClick={handleUploadIPFS}
            disabled={!canProceedFromStep2 || isUploading}
            style={{
              ...buttonStyle("secondary"),
              flex: "none",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: !canProceedFromStep2 || isUploading ? 0.45 : 1,
              cursor: !canProceedFromStep2 || isUploading ? "not-allowed" : "pointer",
            }}
            {...secondaryHover}
          >
            <CloudUpload size={16} aria-hidden="true" />
            {cid ? "Upload again" : "Upload to IPFS"}
          </button>

          {/* Navigation */}
          <div style={buttonGroupStyle}>
            <button id="step2-back-btn" type="button" onClick={() => setCurrentStep(1)} style={buttonStyle("secondary")} {...secondaryHover}>
              Back
            </button>
            <button
              id="step2-next-btn"
              type="button"
              onClick={() => setCurrentStep(3)}
              disabled={!canProceedFromStep2}
              aria-describedby={canProceedFromStep2 ? undefined : "step2-hint"}
              style={{
                ...buttonStyle("primary"),
                flex: 1,
                opacity: canProceedFromStep2 ? 1 : 0.45,
                cursor: canProceedFromStep2 ? "pointer" : "not-allowed",
              }}
              {...primaryHover}
            >
              Next
            </button>
          </div>
          {!canProceedFromStep2 && (
            <div id="step2-hint" style={{ marginTop: "10px", fontSize: "12px", color: "#94a3b8", textAlign: "right" }}>
              {step2Hint}
            </div>
          )}
        </div>
      )}

      {/* Step 3: confirm (demo) */}
      {currentStep === 3 && (
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Step 3: Confirm &amp; Submit (Demo)</h2>

          <div style={{ ...infoBoxStyle("139,148,155"), marginBottom: "24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <SummaryItem label="Case ID" mono>
                {formData.caseId || NOT_PROVIDED}
              </SummaryItem>
              <SummaryItem label="Case Title">{formData.caseTitle || NOT_PROVIDED}</SummaryItem>
              <SummaryItem label="Evidence Type">{formData.evidenceType || NOT_PROVIDED}</SummaryItem>
              <SummaryItem label="File Name" breakAll>
                {selectedFile?.name ?? NOT_PROVIDED}
              </SummaryItem>
              <SummaryItem label="File Size">{selectedFile ? formatFileSize(selectedFile.size) : NOT_PROVIDED}</SummaryItem>
            </div>

            <SummaryItem label="Description">{formData.description || NOT_PROVIDED}</SummaryItem>
          </div>

          <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>SHA-256 Hash (computed locally)</div>
          <div style={hashBoxStyle}>{sha256Hash}</div>

          <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>IPFS CID</div>
          <div style={cidBoxStyle}>{cid || CID_PLACEHOLDER}</div>

          <div style={buttonGroupStyle}>
            <button id="step3-back-btn" type="button" onClick={() => setCurrentStep(2)} style={buttonStyle("secondary")} {...secondaryHover}>
              Back
            </button>
            <button
              id="step3-submit-btn"
              type="button"
              onClick={handleSubmit}
              style={{ ...buttonStyle("primary"), flex: 1 }}
              {...primaryHover}
            >
              Submit (demo only)
            </button>
          </div>
        </div>
      )}

      {/* Demo-only dialog: dismissed by the user, never auto-closes */}
      {showDemoModal && (
        <div style={modalOverlayStyle}>
          <div role="dialog" aria-modal="true" aria-labelledby="demo-modal-title" aria-describedby="demo-modal-desc" style={modalStyle}>
            <Info size={56} aria-hidden="true" style={{ margin: "0 auto 16px", color: "#fbbf24" }} />
            <h2 id="demo-modal-title" style={modalTitleStyle}>
              Demo only
            </h2>
            <p id="demo-modal-desc" style={{ fontSize: "14px", color: "#cbd5e1", marginBottom: "8px", lineHeight: 1.6 }}>
              {cid ? "Demo only: nothing was recorded on a blockchain." : "Demo only: nothing was uploaded or recorded."}
            </p>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "16px", lineHeight: 1.6, wordBreak: "break-all" }}>
              {cid
                ? `The file was pinned to public IPFS (CID ${cid}) and is readable by anyone with that CID. No case record or transaction was created.`
                : "No file was sent anywhere, nothing was pinned to IPFS and nothing was written to a blockchain. The SHA-256 was computed locally in your browser."}
            </p>
            <button
              id="modal-done-btn"
              ref={dismissButtonRef}
              type="button"
              onClick={closeDemoModal}
              style={{ ...buttonStyle("primary"), width: "100%" }}
              {...primaryHover}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Spinner keyframes injected inline so no CSS file change is needed */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
