import { useMemo } from "react";
import { useRole } from "../context/roleContext.js";
import { inBranchScope } from "./roles.js";
import { useLedgerQuery } from "./useLedgerQuery.js";

const loadEvidence = async (ledger) => {
  const [records, paused] = await Promise.all([ledger.listEvidence(), ledger.isPaused()]);
  return { records, paused };
};

/**
 * The evidence records (with their custody trails) of the wallet's own branch, or of every branch for the Chief, plus
 * whether the ledger is paused, kept current as the chain changes.
 *
 * The branch filter is compartmentalisation for the UI, not secrecy: ledger reads are public (see the privacy note in
 * EvidenceLocker.sol). What is enforced is that only the branch's own investigators can WRITE to its evidence (the
 * contract) and read its case titles (the API).
 *
 * @returns {{ status: "idle"|"loading"|"ready"|"error", records: object[], paused: boolean, error: string|null, version: number, reload: () => Promise<void> }}
 */
export function useEvidence() {
  const { status, data, error, version, reload } = useLedgerQuery(loadEvidence);
  const { roles, branchId } = useRole();
  const scope = useMemo(() => ({ global: roles.isChief, branchId }), [roles.isChief, branchId]);
  // Records from a ledger without branches (an older contract, a test double) carry no branchId and are not filtered.
  const records = useMemo(() => (data?.records ?? []).filter((r) => r.branchId === undefined || inBranchScope(scope, r.branchId)), [data, scope]);
  return { status, records, paused: data?.paused ?? false, error, version, reload };
}
