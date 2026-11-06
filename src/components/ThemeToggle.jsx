import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/theme.js";

/** Night / day switch for the top bar. A real toggle button (aria-pressed = night mode on). */
export default function ThemeToggle({ style }) {
  const { theme, toggle } = useTheme();
  const night = theme === "dark";

  const onClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    toggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  return (
    <button
      type="button"
      className="dfl-focusable theme-toggle"
      onClick={onClick}
      aria-pressed={night}
      aria-label="Night mode"
      title={night ? "Switch to day mode" : "Switch to night mode"}
      style={style}
    >
      <span className="theme-toggle-icon" data-visible={night || undefined}>
        <Moon size={16} aria-hidden="true" />
      </span>
      <span className="theme-toggle-icon" data-visible={!night || undefined}>
        <Sun size={16} aria-hidden="true" />
      </span>
    </button>
  );
}
