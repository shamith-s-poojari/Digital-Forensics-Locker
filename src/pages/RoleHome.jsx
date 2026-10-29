import { useMemo, useState } from "react";
import { useCaseDirectory } from "../cases/caseDirectoryContext.js";
import { Spinner } from "../components/ui";
import { useRole } from "../context/roleContext.js";
import { useWallet } from "../context/walletContext.js";
import { directoryFromCases } from "../web3/caseModel.js";
import { primaryRole, ROLES } from "../web3/roles.js";
import { useEvidence } from "../web3/useEvidence.js";
import { useLedgerQuery } from "../web3/useLedgerQuery.js";
import AdminDashboard from "./dashboards/AdminDashboard";
import AuditorDashboard from "./dashboards/AuditorDashboard";
import ChiefDashboard from "./dashboards/ChiefDashboard";
import InvestigatorDashboard from "./dashboards/InvestigatorDashboard";

const loadMembers = (ledger) => ledger.listRoleMembers();
const NO_MEMBERS = Object.freeze({ chief: null, admins: [], investigators: [], auditors: [] });

const DASHBOARDS = {
  [ROLES.CHIEF]: ChiefDashboard,
  [ROLES.ADMIN]: AdminDashboard,
  [ROLES.INVESTIGATOR]: InvestigatorDashboard,
  [ROLES.AUDITOR]: AuditorDashboard,
};

/**
 * /home: each role's own dashboard, chosen by the wallet's most senior role on the contract (roles.js primaryRole).
 * A Chief or Admin who also holds the Investigator role sees their investigator work underneath.
 *
 * What a dashboard shows is a convenience, like every page: the contract and the API check each action again.
 */
export default function RoleHome() {
  const { roles } = useRole();
  const { account } = useWallet();
  const { status, records, paused, error } = useEvidence();
  const members = useLedgerQuery(loadMembers);
  const directoryState = useCaseDirectory();
  const directory = useMemo(() => directoryFromCases(directoryState.cases), [directoryState.cases]);
  // "x minutes ago" is relative to when the page opened; reloading the page refreshes it.
  const [nowMs] = useState(() => Date.now());

  if (status === "loading" || status === "idle") return <Spinner label="Loading your dashboard…" />;
  if (status === "error") {
    return (
      <p role="alert" className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
        Could not read the ledger: {error}
      </p>
    );
  }

  const role = primaryRole(roles);
  const Dashboard = DASHBOARDS[role];
  if (!Dashboard) return null; // the route guard never lets a wallet without a role this far
  const props = { records, paused, members: members.data ?? NO_MEMBERS, directory, account, nowMs };

  return (
    <div className="space-y-10">
      <Dashboard {...props} />
      {roles.isInvestigator && role !== ROLES.INVESTIGATOR ? <InvestigatorDashboard {...props} embedded /> : null}
    </div>
  );
}
