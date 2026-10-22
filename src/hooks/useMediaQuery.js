import { useCallback, useSyncExternalStore } from "react";

/**
 * Safely reads `window.matchMedia`. Returns null when it is unavailable (server rendering,
 * jsdom, very old browsers) or when the query is invalid, so callers can fall back.
 */
function getMediaQueryList(query) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia(query) ?? null;
  } catch {
    return null;
  }
}

/**
 * Tracks whether a CSS media query currently matches.
 *
 *   const isMobile = useMediaQuery("(max-width: 767px)");
 *
 * - Built on `useSyncExternalStore`, so the first client render already has the right value
 *   (no desktop-layout flash on phones) and updates arrive without tearing.
 * - Safe fallback: when `window.matchMedia` is missing (jsdom, SSR, old browsers) the hook
 *   never throws and returns `defaultValue`, and nothing is subscribed.
 * - Supports the legacy `addListener`/`removeListener` API of older Safari.
 *
 * @param {string} query A CSS media query, for example "(max-width: 767px)".
 * @param {boolean} [defaultValue=false] Value to use when matchMedia is unavailable.
 * @returns {boolean} Whether the query matches.
 */
export function useMediaQuery(query, defaultValue = false) {
  const subscribe = useCallback(
    (onChange) => {
      const list = getMediaQueryList(query);
      if (!list) return () => {};

      if (typeof list.addEventListener === "function") {
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
      }
      if (typeof list.addListener === "function") {
        list.addListener(onChange);
        return () => list.removeListener(onChange);
      }
      return () => {};
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    const list = getMediaQueryList(query);
    return list ? Boolean(list.matches) : defaultValue;
  }, [query, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
