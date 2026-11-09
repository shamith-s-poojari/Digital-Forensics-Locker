import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/theme.js";

/** Night / day switch for the top bar. A real toggle button (aria-pressed = night mode on). */
export default function ThemeToggle({ style }) {
  const { theme, toggle } = useTheme();
  const night = theme === "dark";

  return (
    <button
      type="button"
      className="dfl-focusable theme-toggle"
      onClick={() => toggle()}
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
