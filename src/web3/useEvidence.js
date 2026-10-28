import { useLedgerQuery } from "./useLedgerQuery.js";

const loadEvidence = async (ledger) => {
  const [records, paused] = await Promise.all([ledger.listEvidence(), ledger.isPaused()]);
  return { records, paused };
};

/**
 * Every evidence record (with its custody trail) plus whether the ledger is paused, kept current as the chain changes.
 *
 * @returns {{ status: "idle"|"loading"|"ready"|"error", records: object[], paused: boolean, error: string|null, version: number, reload: () => Promise<void> }}
 */
export function useEvidence() {
  const { status, data, error, version, reload } = useLedgerQuery(loadEvidence);
  return { status, records: data?.records ?? [], paused: data?.paused ?? false, error, version, reload };
}
