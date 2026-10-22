// Visual config per label. Background, border and dot colors match the status/event
// colors previously duplicated in CaseManagement, ChainOfCustody and EvidenceViewer.
// `color` (the text) is nudged lighter than the dot for red, blue and slate so the
// 11px label reaches WCAG AA (4.5:1) on the dark theme surfaces (#0f172a / #1e293b).
const GREEN = { dot: "#22c55e", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)" };
const YELLOW = { dot: "#eab308", color: "#eab308", bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.3)" };
const RED = { dot: "#ef4444", color: "#f87171", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)" };
const BLUE = { dot: "#3b82f6", color: "#60a5fa", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.3)" };
const SLATE = { dot: "#64748b", color: "#94a3b8", bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.3)" };

const BADGES = {
  // Evidence statuses
  Verified: { ...GREEN, kind: "Evidence status" },
  Pending: { ...YELLOW, kind: "Evidence status" },
  Flagged: { ...RED, kind: "Evidence status" },
  // Case statuses
  Active: { ...GREEN, kind: "Case status" },
  "Under Review": { ...YELLOW, kind: "Case status" },
  Closed: { ...SLATE, kind: "Case status" },
  // Custody event types
  Submit: { ...GREEN, kind: "Event type" },
  Access: { ...BLUE, kind: "Event type" },
  Verify: { ...YELLOW, kind: "Event type" },
};

const FALLBACK = { ...SLATE, kind: "Status" };

const SIZES = {
  sm: { fontSize: "10px", padding: "2px 8px", dot: 4, gap: "4px" },
  md: { fontSize: "11px", padding: "3px 10px", dot: 5, gap: "5px" },
  lg: { fontSize: "12px", padding: "4px 12px", dot: 6, gap: "6px" },
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

/**
 * Pill badge for every status or event label in the app.
 *
 * Supported `status` values:
 *   evidence: "Verified" | "Pending" | "Flagged"
 *   case:     "Active" | "Under Review" | "Closed"
 *   event:    "Submit" | "Access" | "Verify"
 * Any other value renders in a neutral slate style.
 *
 * Meaning is never conveyed by color alone: the label text is always rendered, and a
 * visually hidden prefix (for example "Case status:") tells screen reader users what kind
 * of label it is. The colored dot is decorative.
 *
 * @param {object} props
 * @param {string} props.status Label to display (see list above).
 * @param {"sm" | "md" | "lg"} [props.size="md"] "md" matches the previous badge size.
 */
export default function StatusBadge({ status, size = "md" }) {
  const badge = BADGES[status] ?? FALLBACK;
  const sizing = SIZES[size] ?? SIZES.md;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sizing.gap,
        borderRadius: "20px",
        padding: sizing.padding,
        fontSize: sizing.fontSize,
        fontWeight: 600,
        fontFamily: "'Space Grotesk', sans-serif",
        whiteSpace: "nowrap",
        position: "relative",
        background: badge.bg,
        color: badge.color,
        border: `1px solid ${badge.border}`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: sizing.dot,
          height: sizing.dot,
          borderRadius: "50%",
          backgroundColor: badge.dot,
          flexShrink: 0,
        }}
      />
      <span style={visuallyHidden}>{badge.kind}: </span>
      <span>{status}</span>
    </span>
  );
}
