import { ShieldCheck } from "lucide-react";
import { useAccessRequests } from "../../access/accessRequestContext.js";
import { ActivityList, DashboardIntro, MemberGroup, PanelLink, PausedNotice, RequestQueue, StatGrid, StatTile } from "../../components/dashboard/parts";
import { Panel } from "../../components/ui";
import { activityFeed } from "../../dashboard/dashboardModel.js";

/**
 * An Admin's home: the request queue they can decide (Admin requests wait for the Chief), the officers they manage,
 * and recent activity. Granting and revoking happen on Role Management.
 */
export default function AdminDashboard({ records, paused, members, directory, account, nowMs }) {
  const requests = useAccessRequests();
  const decidable = requests.pending.filter((r) => r.role !== "admin").length;

  return (
    <div className="space-y-6">
      <DashboardIntro icon={ShieldCheck} title="Admin workspace">
        You grant and revoke the Investigator and Auditor roles, decide their access requests and can pause evidence
        writes. Appointing Admins is the Chief&apos;s decision.
      </DashboardIntro>
      <PausedNotice paused={paused} />

      <StatGrid>
        <StatTile label="Requests to decide" value={decidable} tone={decidable ? "info" : "neutral"} hint="Investigator and Auditor" to="/admin" />
        <StatTile label="Investigators" value={members.investigators.length} to="/admin" />
        <StatTile label="Auditors" value={members.auditors.length} to="/admin" />
        <StatTile label="Ledger" value={paused ? "Paused" : "Active"} tone={paused ? "warning" : "success"} hint="Pause or resume on Role Management" to="/admin" />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <RequestQueue isChief={false} nowMs={nowMs} />
        <Panel title="Officers" titleId="dash-officers" bodyClassName="divide-y divide-slate-800 p-0" actions={<PanelLink to="/admin">Manage roles</PanelLink>}>
          <MemberGroup label="Investigators" addresses={members.investigators} you={account} />
          <MemberGroup label="Auditors" addresses={members.auditors} you={account} />
          <MemberGroup label="Chief" addresses={members.chief ? [members.chief] : []} you={account} />
        </Panel>
      </div>

      <Panel title="Recent activity" titleId="dash-activity" bodyClassName="p-0" actions={<PanelLink to="/cases">All cases</PanelLink>}>
        <ActivityList entries={activityFeed(records, { limit: 8 })} directory={directory} you={account} nowMs={nowMs} />
      </Panel>
    </div>
  );
}
