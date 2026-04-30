import { useState } from "react";
import { Upload, CheckCircle } from "lucide-react";
import { computeSHA256 } from "../utils/hash";

export default function EvidenceUpload() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    caseId: "",
    caseTitle: "",
    evidenceType: "",
    description: "",
    fileName: "",
    fileSize: "",
    hash: "",
    ipfsCid: ""
  });
  const [isComputingHash, setIsComputingHash] = useState(false);
  const [isUploadingIPFS, setIsUploadingIPFS] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = async (file) => {
    setFormData(prev => ({
      ...prev,
      fileName: file.name,
      fileSize: (file.size / 1024 / 1024).toFixed(2) + " MB"
    }));

    setIsComputingHash(true);
    try {
      const hash = await computeSHA256(file);
      setFormData(prev => ({ ...prev, hash }));
    } catch (error) {
      console.error("Error computing hash:", error);
    }
    setIsComputingHash(false);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = "#3b82f6";
    e.currentTarget.style.background = "rgba(59,130,246,0.05)";
  };

  const handleDragLeave = (e) => {
    e.currentTarget.style.borderColor = "rgba(139,148,155,0.4)";
    e.currentTarget.style.background = "transparent";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = "rgba(139,148,155,0.4)";
    e.currentTarget.style.background = "transparent";
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleUploadIPFS = async () => {
    setIsUploadingIPFS(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setFormData(prev => ({ ...prev, ipfsCid: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco" }));
    setIsUploadingIPFS(false);
  };

  const handleSubmit = () => {
    setShowSubmitModal(true);
    setTimeout(() => {
      setShowSubmitModal(false);
      setCurrentStep(1);
      setFormData({
        caseId: "",
        caseTitle: "",
        evidenceType: "",
        description: "",
        fileName: "",
        fileSize: "",
        hash: "",
        ipfsCid: ""
      });
    }, 3000);
  };

  const headerStyle = {
    marginBottom: "32px",
  };

  const titleStyle = {
    fontSize: "28px",
    fontWeight: 700,
    color: "#e2e8f0",
    marginBottom: "4px",
  };

  const subtitleStyle = {
    fontSize: "14px",
    color: "#94a3b8",
  };

  const stepsStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    marginBottom: "32px",
  };

  const stepCircleStyle = (isActive) => ({
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    color: isActive ? "white" : "#94a3b8",
    background: isActive ? "#3b82f6" : "rgba(100,116,139,0.2)",
  });

  const stepLineStyle = (isActive) => ({
    height: "2px",
    width: "80px",
    background: isActive ? "#3b82f6" : "rgba(100,116,139,0.2)",
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
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: "120px",
    resize: "none",
    fontFamily: "'Space Grotesk', sans-serif",
  };

  const dropZoneStyle = {
    border: "2px dashed rgba(100,116,139,0.4)",
    borderRadius: "8px",
    padding: "64px 32px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    marginBottom: "16px",
    background: "rgba(30,41,59,0.2)",
  };

  const buttonStyle = (variant = "primary") => ({
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

  const sectionTitleStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#e2e8f0",
    marginBottom: "20px",
  };

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

  const buttonGroupStyle = {
    display: "flex",
    gap: "12px",
    marginTop: "24px",
  };

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

  const modalTitleStyle = {
    fontSize: "24px",
    fontWeight: 700,
    color: "#e2e8f0",
    marginBottom: "12px",
  };

  const modalTextStyle = {
    fontSize: "13px",
    color: "#94a3b8",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: "12px",
    wordBreak: "break-all",
  };

  return (
    <div>
      <div style={headerStyle}>
        <div style={titleStyle}>Evidence Upload</div>
        <div style={subtitleStyle}>Three-step evidence submission wizard</div>
      </div>

      <div style={stepsStyle}>
        <div style={stepCircleStyle(currentStep >= 1)}>1</div>
        <div style={stepLineStyle(currentStep >= 2)}></div>
        <div style={stepCircleStyle(currentStep >= 2)}>2</div>
        <div style={stepLineStyle(currentStep >= 3)}></div>
        <div style={stepCircleStyle(currentStep >= 3)}>3</div>
      </div>

      {currentStep === 1 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Step 1: Case Information</div>
          <input
            type="text"
            name="caseId"
            placeholder="Case ID"
            value={formData.caseId}
            onChange={handleInputChange}
            style={inputStyle}
            onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
            onBlur={(e) => e.target.style.borderColor = "rgba(100,116,139,0.3)"}
          />
          <input
            type="text"
            name="caseTitle"
            placeholder="Case Title"
            value={formData.caseTitle}
            onChange={handleInputChange}
            style={inputStyle}
            onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
            onBlur={(e) => e.target.style.borderColor = "rgba(100,116,139,0.3)"}
          />
          <select
            name="evidenceType"
            value={formData.evidenceType}
            onChange={handleInputChange}
            style={{ ...inputStyle, color: formData.evidenceType ? "#e2e8f0" : "#94a3b8" }}
            onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
            onBlur={(e) => e.target.style.borderColor = "rgba(100,116,139,0.3)"}
          >
            <option value="">Select Evidence Type</option>
            <option value="Digital Image">Digital Image</option>
            <option value="Video">Video</option>
            <option value="Document">Document</option>
            <option value="Device Log">Device Log</option>
            <option value="Other">Other</option>
          </select>
          <textarea
            name="description"
            placeholder="Description"
            value={formData.description}
            onChange={handleInputChange}
            style={textareaStyle}
            onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
            onBlur={(e) => e.target.style.borderColor = "rgba(100,116,139,0.3)"}
          />
          <button
            onClick={() => setCurrentStep(2)}
            style={buttonStyle("primary")}
            onMouseEnter={(e) => e.target.style.background = "#2563eb"}
            onMouseLeave={(e) => e.target.style.background = "#3b82f6"}
          >
            Next
          </button>
        </div>
      )}

      {currentStep === 2 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Step 2: Upload Evidence File</div>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById("fileInput")?.click()}
            style={dropZoneStyle}
          >
            <Upload size={48} style={{ margin: "0 auto 16px", color: "#8b949e" }} />
            <div style={{ color: "#f0f6fc", fontWeight: 600, fontSize: "14px" }}>Drag file here or click to select</div>
            <input
              id="fileInput"
              type="file"
              onChange={handleFileInputChange}
              style={{ display: "none" }}
            />
          </div>

          {formData.fileName && (
            <div style={infoBoxStyle("139,148,155")}>
              <div style={{ fontSize: "13px", color: "#f0f6fc", marginBottom: "4px" }}>
                <strong>File:</strong> {formData.fileName}
              </div>
              <div style={{ fontSize: "13px", color: "#8b949e" }}>
                <strong>Size:</strong> {formData.fileSize}
              </div>
            </div>
          )}

          <div style={{ marginTop: "24px", padding: "20px", background: "rgba(30,41,59,0.4)", border: "1px solid rgba(100,116,139,0.3)", borderRadius: "8px", marginBottom: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", marginBottom: "12px" }}>Client-Side SHA-256 Hash</div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "8px" }}>
              This file's cryptographic hash will be computed in your browser for verification on the blockchain.
            </div>
            {formData.hash ? (
              <div style={{ ...hashBoxStyle, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", marginBottom: "0" }}>
                {formData.hash}
              </div>
            ) : (
              <div style={{ ...hashBoxStyle, background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.2)", color: "#94a3b8", marginBottom: "0" }}>
                {isComputingHash ? "Computing..." : "a1f7c9b2e8d4c6f3a5b1e7d9c2f4b8a3c5e7f1d3b5a9c1e3f5d7b9a1c3e5"}
              </div>
            )}
          </div>

          {isComputingHash && (
            <div style={{...infoBoxStyle("245,158,11"), textAlign: "center", fontSize: "13px", color: "#f59e0b"}}>
              ⏳ Computing SHA-256 hash...
            </div>
          )}

          {formData.hash && (
            <button
              onClick={handleUploadIPFS}
              disabled={isUploadingIPFS}
              style={{ ...buttonStyle("primary"), opacity: isUploadingIPFS ? 0.6 : 1 }}
              onMouseEnter={(e) => !isUploadingIPFS && (e.target.style.background = "#2563eb")}
              onMouseLeave={(e) => !isUploadingIPFS && (e.target.style.background = "#3b82f6")}
            >
              {isUploadingIPFS ? "Uploading to IPFS..." : "Upload to IPFS"}
            </button>
          )}

          {formData.ipfsCid && (
            <div>
              <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>IPFS Content Identifier (CID)</div>
              <div style={ciidBoxStyle}>{formData.ipfsCid}</div>
            </div>
          )}

          <div style={buttonGroupStyle}>
            <button
              onClick={() => setCurrentStep(1)}
              style={buttonStyle("secondary")}
              onMouseEnter={(e) => e.target.style.background = "rgba(59,130,246,0.1)"}
              onMouseLeave={(e) => e.target.style.background = "transparent"}
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              disabled={!formData.ipfsCid}
              style={{ ...buttonStyle("primary"), flex: 1, opacity: formData.ipfsCid ? 1 : 0.5 }}
              onMouseEnter={(e) => formData.ipfsCid && (e.target.style.background = "#2563eb")}
              onMouseLeave={(e) => formData.ipfsCid && (e.target.style.background = "#3b82f6")}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Step 3: Confirm & Submit</div>
          <div style={{ ...infoBoxStyle("139,148,155"), marginBottom: "24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px" }}>CASE ID</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: "#f0f6fc", fontSize: "13px" }}>{formData.caseId}</div>
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
                <div style={{ color: "#f0f6fc", fontSize: "13px" }}>{formData.fileName}</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px" }}>DESCRIPTION</div>
              <div style={{ color: "#f0f6fc", fontSize: "13px" }}>{formData.description}</div>
            </div>
          </div>

          <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>SHA-256 Hash</div>
          <div style={hashBoxStyle}>{formData.hash}</div>

          <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>IPFS CID</div>
          <div style={ciidBoxStyle}>{formData.ipfsCid}</div>

          <div style={buttonGroupStyle}>
            <button
              onClick={() => setCurrentStep(2)}
              style={buttonStyle("secondary")}
              onMouseEnter={(e) => e.target.style.background = "rgba(59,130,246,0.1)"}
              onMouseLeave={(e) => e.target.style.background = "transparent"}
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              style={{ ...buttonStyle("primary"), flex: 1 }}
              onMouseEnter={(e) => e.target.style.background = "#2563eb"}
              onMouseLeave={(e) => e.target.style.background = "#3b82f6"}
            >
              Submit to Blockchain
            </button>
          </div>
        </div>
      )}

      {showSubmitModal && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <CheckCircle size={64} style={{ margin: "0 auto 16px", color: "#10b981" }} />
            <div style={modalTitleStyle}>Transaction Submitted!</div>
            <div style={modalTextStyle}>0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1</div>
            <div style={{ fontSize: "13px", color: "#8b949e", marginBottom: "16px" }}>Block: 7489201</div>
            <button
              onClick={() => setShowSubmitModal(false)}
              style={{ ...buttonStyle("primary"), width: "100%" }}
              onMouseEnter={(e) => e.target.style.background = "#2563eb"}
              onMouseLeave={(e) => e.target.style.background = "#3b82f6"}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
