import { Crown } from "lucide-react";
import { useAccessRequests } from "../../access/accessRequestContext.js";
import { ActivityList, DashboardIntro, MemberGroup, PanelLink, PausedNotice, RequestQueue, StatGrid, StatTile } from "../../components/dashboard/parts";
import { Badge, Panel } from "../../components/ui";
import { activityFeed, caseCount, exceptions } from "../../dashboard/dashboardModel.js";

const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The Chief's home: who holds which role, who is waiting for one (Admin requests only the Chief can decide), whether
 * anything on the ledger needs attention, and the latest activity. Decisions are made on Role Management.
 */
export default function ChiefDashboard({ records, paused, members, directory, account, nowMs }) {
  const requests = useAccessRequests();
  const pending = requests.pending.length;
  const adminRequests = requests.pending.filter((r) => r.role === "admin").length;
  const { mismatches, reassignments } = exceptions(records);

  return (
    <div className="space-y-6">
      <DashboardIntro icon={Crown} title="Chief's overview">
        You hold the top seat on the ledger: you appoint Admins, approve any role and can pause all evidence writes. You
        do not handle evidence yourself unless you also hold the Investigator role.
      </DashboardIntro>
      <PausedNotice paused={paused} />

      <StatGrid>
        <StatTile
          label="Pending requests"
          value={pending}
          tone={adminRequests ? "warning" : pending ? "info" : "neutral"}
          hint={adminRequests ? `${adminRequests} for Admin: only you can decide` : "Wallets waiting for a role"}
          to="/admin"
        />
        <StatTile label="Investigators" value={members.investigators.length} hint={`${count(members.auditors.length, "auditor")} · ${count(members.admins.length, "admin")}`} to="/admin" />
        <StatTile label="Evidence items" value={records.length} hint={`${caseCount(records)} cases`} to="/cases" />
        <StatTile label="Hash mismatches" value={mismatches.length} tone={mismatches.length ? "danger" : "success"} hint="Latest re-check failed" to="/cases" />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <RequestQueue isChief nowMs={nowMs} />
        <Panel title="Team" titleId="dash-team" bodyClassName="divide-y divide-slate-800 p-0" actions={<PanelLink to="/admin">Manage roles</PanelLink>}>
          <MemberGroup label="Admins" addresses={members.admins} you={account} />
          <MemberGroup label="Investigators" addresses={members.investigators} you={account} />
          <MemberGroup label="Auditors" addresses={members.auditors} you={account} />
        </Panel>
      </div>

      <Panel title="Ledger status" titleId="dash-ledger" actions={<PanelLink to="/admin">Pause or resume</PanelLink>}>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          {paused ? <Badge tone="warning">Paused</Badge> : <Badge tone="success">Active</Badge>}
          <span>
            {reassignments.length === 0
              ? "No custody has been reassigned by the Chief."
              : `Custody has been reassigned by the Chief ${reassignments.length} time${reassignments.length === 1 ? "" : "s"}; Auditors see each one as an exception.`}
          </span>
        </div>
      </Panel>

      <Panel title="Recent activity" titleId="dash-activity" bodyClassName="p-0" actions={<PanelLink to="/cases">All cases</PanelLink>}>
        <ActivityList entries={activityFeed(records, { limit: 8 })} directory={directory} you={account} nowMs={nowMs} />
      </Panel>
    </div>
  );
}
