import { useCallback, useSyncExternalStore } from "react";

/*
 * Night (dark, the default) / day (light) theme. The choice lives on <html data-theme> and in localStorage;
 * index.html applies the saved value before the first paint so a reload never flashes the wrong theme.
 */

export const THEME_STORAGE_KEY = "dfl-theme";
const THEME_COLORS = { dark: "#070707", light: "#fafafa" };

export function readTheme() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

const listeners = new Set();
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still changes, it just isn't remembered.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Switches theme. With `origin` (the toggle's centre, in viewport px) and View Transitions support, the new
 * theme is revealed as a circle growing from that point; otherwise it switches instantly.
 */
export function setTheme(theme, origin) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!origin || reduceMotion || typeof document.startViewTransition !== "function") {
    applyTheme(theme);
    return;
  }
  const root = document.documentElement;
  const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y));
  root.style.setProperty("--reveal-x", `${origin.x}px`);
  root.style.setProperty("--reveal-y", `${origin.y}px`);
  root.style.setProperty("--reveal-r", `${radius}px`);
  document.startViewTransition(() => applyTheme(theme));
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark");
  const toggle = useCallback((origin) => setTheme(theme === "light" ? "dark" : "light", origin), [theme]);
  return { theme, toggle };
}
