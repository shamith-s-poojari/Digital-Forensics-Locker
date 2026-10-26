import { useCallback, useEffect, useRef, useState } from "react";
import { useRole } from "../context/roleContext.js";
import { friendlyMessage } from "./ledgerErrors.js";
import { useLedger } from "./ledgerContext.js";

/**
 * Loads data from the ledger and keeps it current as the chain changes.
 *
 * Reads happen only while the wallet's role is known ("ready"), so a denied or unidentified user never triggers
 * ledger reads. Results belong to the ledger instance that produced them and are discarded when it changes.
 *
 * @template T
 * @param {(ledger: object) => Promise<T>} query  MUST be a stable function (declare it at module level).
 * @returns {{ status: "idle"|"loading"|"ready"|"error", data: T|undefined, error: string|null, version: number, reload: () => Promise<void> }}
 *          `version` changes on every completed load, so callers can re-run checks that depend on fresh data.
 */
export function useLedgerQuery(query) {
  const { ledger } = useLedger();
  const { status: roleStatus } = useRole();
  const enabled = Boolean(ledger) && roleStatus === "ready";

  const [result, setResult] = useState({ ledger: null, data: undefined, error: null, version: 0 });
  const requestRef = useRef(0);
  const versionRef = useRef(0);

  const reload = useCallback(async () => {
    if (!ledger) return;
    const requestId = ++requestRef.current;
    try {
      const data = await query(ledger);
      if (requestId === requestRef.current) setResult({ ledger, data, error: null, version: ++versionRef.current });
    } catch (err) {
      if (requestId === requestRef.current) setResult({ ledger, data: undefined, error: friendlyMessage(err), version: ++versionRef.current });
    }
  }, [ledger, query]);

  useEffect(() => {
    if (!enabled) return undefined;
    void reload();
    const unsubscribe = ledger.subscribe?.(() => void reload());
    return () => {
      requestRef.current += 1; // whatever is still in flight is now stale
      unsubscribe?.();
    };
  }, [enabled, ledger, reload]);

  if (!enabled) return { status: "idle", data: undefined, error: null, version: 0, reload };
  if (result.ledger !== ledger) return { status: "loading", data: undefined, error: null, version: 0, reload };
  if (result.error) return { status: "error", data: undefined, error: result.error, version: result.version, reload };
  return { status: "ready", data: result.data, error: null, version: result.version, reload };
}
