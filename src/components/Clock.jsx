import { useEffect, useState } from "react";

const FORMAT_OPTIONS = {
  weekday: "short",
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const formatTime = (date) => date.toLocaleString("en-US", FORMAT_OPTIONS);

const baseStyle = {
  fontSize: "12px",
  color: "#94a3b8",
  fontFamily: "'JetBrains Mono', monospace",
  whiteSpace: "nowrap",
};

/**
 * Ticking clock for the top bar.
 *
 * The one-second tick lives in this component (state + interval, cleared on unmount), so it
 * re-renders only this tiny element and not the whole Layout and the page below it.
 *
 * Accessibility: `role="timer"` has an implicit `aria-live="off"`, so screen readers are not
 * interrupted every second; the time is still readable in browse mode.
 *
 * Honesty: this is the device clock, not a trusted timestamp, and the tooltip says so.
 *
 * @param {object} [props]
 * @param {import("react").CSSProperties} [props.style] Extra styles merged over the defaults.
 */
export default function Clock({ style }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <time
      role="timer"
      aria-live="off"
      dateTime={now.toISOString()}
      title="Your device's local time. It is not a trusted timestamp."
      style={{ ...baseStyle, ...style }}
    >
      {formatTime(now)}
    </time>
  );
}
