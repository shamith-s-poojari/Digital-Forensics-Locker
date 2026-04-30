export default function StatusBadge({ status }) {
  const badgeStyles = {
    Verified: {
      background: "rgba(16,185,129,0.15)",
      color: "#10b981",
      border: "1px solid rgba(16,185,129,0.3)",
    },
    Pending: {
      background: "rgba(245,158,11,0.15)",
      color: "#f59e0b",
      border: "1px solid rgba(245,158,11,0.3)",
    },
    Flagged: {
      background: "rgba(239,68,68,0.15)",
      color: "#ef4444",
      border: "1px solid rgba(239,68,68,0.3)",
    },
    Active: {
      background: "rgba(59,130,246,0.15)",
      color: "#3b82f6",
      border: "1px solid rgba(59,130,246,0.3)",
    },
    Closed: {
      background: "rgba(75,85,99,0.2)",
      color: "#9ca3af",
      border: "1px solid rgba(75,85,99,0.3)",
    },
    "Under Review": {
      background: "rgba(139,92,246,0.15)",
      color: "#8b5cf6",
      border: "1px solid rgba(139,92,246,0.3)",
    },
  };

  const style = badgeStyles[status] || badgeStyles.Closed;

  return (
    <span
      style={{
        borderRadius: "20px",
        padding: "3px 10px",
        fontSize: "11px",
        fontWeight: 600,
        fontFamily: "'Space Grotesk', sans-serif",
        display: "inline-block",
        ...style,
      }}
    >
      {status}
    </span>
  );
}
