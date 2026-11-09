import { useLedgerQuery } from "./useLedgerQuery.js";

const loadBranches = async (ledger) => (await ledger.listBranches?.()) ?? [];

/**
 * The branches created on the ledger by the Chief, kept current as the chain changes. Branch names are public, so
 * any wallet (including one with no role yet, choosing where to ask for access) can read them.
 *
 * @returns {{ status: "idle"|"loading"|"ready"|"error", branches: { id: number, name: string }[], error: string|null, nameOf: (id: number) => string }}
 */
export function useBranches() {
  const { status, data, error, reload } = useLedgerQuery(loadBranches);
  const branches = data ?? [];
  const nameOf = (id) => branches.find((b) => b.id === id)?.name ?? (id ? `Branch #${id}` : "No branch");
  return { status, branches, error, nameOf, reload };
}
