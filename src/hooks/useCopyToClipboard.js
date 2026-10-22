import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copies text to the clipboard and tracks which item was copied most recently, so a
 * "Copied" confirmation can be shown next to the right button.
 *
 * - `copiedKey` is the key passed to the last successful `copy()`, reset to null after `resetMs`.
 * - `copy(text, key)` resolves to `true` on success and `false` on failure. It never throws:
 *   a missing Clipboard API (insecure context, old browser) or a denied permission just
 *   returns `false` and leaves `copiedKey` unchanged.
 * - Copying again restarts the timer; the timer is cleared when the component unmounts.
 *
 * @param {number} [resetMs=2000] How long `copiedKey` stays set, in milliseconds.
 * @returns {{ copiedKey: string | null, copy: (text: string, key?: string) => Promise<boolean> }}
 */
export function useCopyToClipboard(resetMs = 2000) {
  const [copiedKey, setCopiedKey] = useState(null);
  const timeoutRef = useRef(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const copy = useCallback(
    async (text, key = text) => {
      clearTimer();
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      try {
        if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
          return false;
        }
        await navigator.clipboard.writeText(String(text));
      } catch {
        return false;
      }

      // Ignore the result if the component unmounted or a newer copy() superseded this one.
      if (!mountedRef.current || requestId !== requestIdRef.current) return true;

      setCopiedKey(key);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setCopiedKey(null);
      }, resetMs);
      return true;
    },
    [clearTimer, resetMs]
  );

  return { copiedKey, copy };
}
