import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// Inline styles (not Tailwind classes): the Tailwind setup in this repo does not generate every
// utility, and every other component styles itself inline on the same dark slate theme.
// Each text/background pair is at least 8:1 (WCAG AA needs 4.5:1). The old blue-400 on blue-900
// and red-400 on red-900 pairs measured only about 4.1:1 and 3.6:1.
const TYPES = {
  info: { background: "#1e3a8a", border: "#3b82f6", color: "#dbeafe" },
  success: { background: "#14532d", border: "#22c55e", color: "#dcfce7" },
  error: { background: "#7f1d1d", border: "#ef4444", color: "#fee2e2" },
  warning: { background: "#713f12", border: "#eab308", color: "#fef9c3" },
};

/**
 * Transient, accessible notification pinned to the bottom-right corner (full width minus a
 * 16px gutter on narrow screens).
 *
 * - `info` and `success` use `role="status"` (polite announcement). `error` and `warning` use
 *   `role="alert"` (assertive). An unknown `type` falls back to `info`.
 * - After `duration` ms it calls `onDismiss`. `duration={0}` keeps it on screen until the
 *   user dismisses it. The timer restarts when `message`, `type` or `duration` change, is
 *   paused while the pointer or keyboard focus is on the toast, and is cleared on unmount.
 *   A new `onDismiss` function identity does not restart the timer.
 * - The toast is controlled: the parent should stop rendering it from `onDismiss`. Give each
 *   notification its own `key` so showing the same message twice restarts the timer.
 * - Renders nothing when `message` is empty.
 *
 * @param {object} props
 * @param {import("react").ReactNode} props.message Text to show.
 * @param {"info" | "success" | "error" | "warning"} [props.type="info"]
 * @param {() => void} [props.onDismiss] Called by the dismiss button and by the auto-dismiss timer.
 * @param {number} [props.duration=5000] Milliseconds before auto-dismiss; 0 (or less) disables it.
 */
export default function Toast({ message, type = "info", onDismiss, duration = 5000 }) {
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);
  const canDismiss = typeof onDismiss === "function";

  // Always call the latest handler without restarting the timer when the parent re-renders.
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message || !canDismiss || paused || !(duration > 0)) return undefined;
    const timer = setTimeout(() => onDismissRef.current?.(), duration);
    return () => clearTimeout(timer);
  }, [message, type, duration, canDismiss, paused]);

  if (!message) return null;

  const theme = TYPES[type] ?? TYPES.info;
  const urgent = type === "error" || type === "warning";

  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: 1100,
        boxSizing: "border-box",
        maxWidth: "min(420px, calc(100vw - 32px))",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "12px 12px 12px 16px",
        borderRadius: "8px",
        border: `1px solid ${theme.border}`,
        backgroundColor: theme.background,
        color: theme.color,
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: "14px",
        lineHeight: 1.5,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss?.()}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "28px",
          height: "28px",
          margin: "-2px 0",
          padding: 0,
          border: "none",
          borderRadius: "6px",
          backgroundColor: "transparent",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
