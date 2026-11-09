import { ShieldCheck } from "lucide-react";
import { useAccessRequests } from "../../access/accessRequestContext.js";
import { ActivityList, DashboardIntro, MemberGroup, PanelLink, PausedNotice, RequestQueue, StatGrid, StatTile } from "../../components/dashboard/parts";
import { Panel } from "../../components/ui";
import { activityFeed, caseCount, membersInBranch } from "../../dashboard/dashboardModel.js";

/**
 * A Branch Admin's home, for their own branch only: its access requests (Branch Admin requests go to the Chief), its
 * officers and its activity. Granting and revoking happen on Role Management, where the contract also refuses any
 * change outside the branch.
 */
export default function AdminDashboard({ records, paused, members, directory, account, nowMs, branchId, branchName }) {
  const requests = useAccessRequests();
  const staff = membersInBranch(members, branchId);
  const where = branchName ?? "your branch";

  return (
    <div className="space-y-6">
      <DashboardIntro icon={ShieldCheck} title="Branch Admin workspace" branch={branchName}>
        You grant and revoke the Investigator and Auditor roles in {where}, decide its access requests and can pause
        evidence writes. Other branches, and appointing Branch Admins, are the Chief&apos;s.
      </DashboardIntro>
      <PausedNotice paused={paused} />

      <StatGrid>
        <StatTile label="Requests to decide" value={requests.pending.length} tone={requests.pending.length ? "info" : "neutral"} hint={`For ${where}`} to="/admin" />
        <StatTile label="Investigators" value={staff.investigators.length} hint={`${staff.auditors.length} auditor${staff.auditors.length === 1 ? "" : "s"}`} to="/admin" />
        <StatTile label="Branch cases" value={caseCount(records)} hint={`${records.length} evidence item${records.length === 1 ? "" : "s"}`} to="/cases" />
        <StatTile label="Ledger" value={paused ? "Paused" : "Active"} tone={paused ? "warning" : "success"} hint="Pause or resume on Role Management" to="/admin" />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <RequestQueue isChief={false} nowMs={nowMs} />
        <Panel title={`Officers in ${where}`} titleId="dash-officers" bodyClassName="divide-y divide-slate-800 p-0" actions={<PanelLink to="/admin">Manage roles</PanelLink>}>
          <MemberGroup label="Investigators" addresses={staff.investigators} you={account} />
          <MemberGroup label="Auditors" addresses={staff.auditors} you={account} />
          <MemberGroup label="Branch Admins" addresses={staff.admins} you={account} />
        </Panel>
      </div>

      <Panel title="Recent activity in this branch" titleId="dash-activity" bodyClassName="p-0" actions={<PanelLink to="/cases">Branch cases</PanelLink>}>
        <ActivityList entries={activityFeed(records, { limit: 8 })} directory={directory} you={account} nowMs={nowMs} />
      </Panel>
    </div>
  );
}
