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
 * Switches theme with a short cross-fade where View Transitions are supported (see index.css); otherwise, or with
 * reduced motion, it switches instantly.
 */
export function setTheme(theme) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || typeof document.startViewTransition !== "function") {
    applyTheme(theme);
    return;
  }
  const transition = document.startViewTransition(() => applyTheme(theme));
  // A skipped or timed-out fade (e.g. a background tab) still applies the theme; don't report it as an error.
  transition.updateCallbackDone?.catch(() => {});
  transition.ready?.catch(() => {});
  transition.finished?.catch(() => {});
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark");
  const toggle = useCallback(() => setTheme(theme === "light" ? "dark" : "light"), [theme]);
  return { theme, toggle };
}
