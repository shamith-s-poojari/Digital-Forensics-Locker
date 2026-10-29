import { Crown } from "lucide-react";
import { useAccessRequests } from "../../access/accessRequestContext.js";
import { ActivityList, DashboardIntro, EmptyNote, MemberGroup, PanelLink, PausedNotice, RequestQueue, StatGrid, StatTile } from "../../components/dashboard/parts";
import { Badge, Panel } from "../../components/ui";
import { activityFeed, branchBreakdown, branchOfMember, exceptions } from "../../dashboard/dashboardModel.js";

const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One row per branch: who works there and how much evidence its cases hold. */
function BranchTable({ rows }) {
  if (rows.length === 0) return <EmptyNote>No branches yet. Create the first one on Role Management.</EmptyNote>;
  const cell = "px-4 py-2.5 text-right tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm text-slate-200">
        <thead className="text-xs uppercase tracking-wide text-slate-400">
          <tr className="border-b border-slate-800">
            <th scope="col" className="px-4 py-2 text-left font-semibold">
              Branch
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Branch Admins
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Investigators
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Auditors
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Cases
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Evidence
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Mismatches
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((b) => (
            <tr key={b.id}>
              <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-100">
                {b.name}
                {b.admins === 0 ? (
                  <Badge tone="warning" className="ml-2">
                    no Branch Admin
                  </Badge>
                ) : null}
              </th>
              <td className={cell}>{b.admins}</td>
              <td className={cell}>{b.investigators}</td>
              <td className={cell}>{b.auditors}</td>
              <td className={cell}>{b.cases}</td>
              <td className={cell}>{b.evidence}</td>
              <td className={`${cell} ${b.mismatches ? "font-semibold text-rose-300" : ""}`}>{b.mismatches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The Chief's home, across every branch: the branches and who works in each, who is waiting for a role (Branch Admin
 * requests only the Chief can decide), whether anything on the ledger needs attention, and the latest activity.
 * Decisions are made on Role Management.
 */
export default function ChiefDashboard({ records, paused, members, directory, account, nowMs, branches, branchNameOf }) {
  const requests = useAccessRequests();
  const pending = requests.pending.length;
  const adminRequests = requests.pending.filter((r) => r.role === "admin").length;
  const { mismatches, reassignments } = exceptions(records);
  const rows = branchBreakdown(branches, members, records);
  const leaderless = rows.filter((b) => b.admins === 0).length;
  const branchTag = (address) => {
    const id = branchOfMember(members, address);
    return id ? branchNameOf(id) : "no branch";
  };

  return (
    <div className="space-y-6">
      <DashboardIntro icon={Crown} title="Chief's overview">
        You hold the top seat on the ledger, over every branch: you create branches, appoint Branch Admins, can approve
        any role and can pause all evidence writes. You do not handle evidence yourself unless you also hold the
        Investigator role.
      </DashboardIntro>
      <PausedNotice paused={paused} />

      <StatGrid>
        <StatTile
          label="Branches"
          value={branches.length}
          tone={leaderless ? "warning" : "neutral"}
          hint={leaderless ? `${count(leaderless, "branch")} without a Branch Admin` : `${count(members.admins.length, "Branch Admin")}`}
          to="/admin"
        />
        <StatTile
          label="Pending requests"
          value={pending}
          tone={adminRequests ? "warning" : pending ? "info" : "neutral"}
          hint={adminRequests ? `${adminRequests} for Branch Admin: only you can decide` : "Wallets waiting for a role"}
          to="/admin"
        />
        <StatTile label="Investigators" value={members.investigators.length} hint={`${count(members.auditors.length, "auditor")} in all branches`} to="/admin" />
        <StatTile label="Hash mismatches" value={mismatches.length} tone={mismatches.length ? "danger" : "success"} hint={`of ${count(records.length, "item")}`} to="/cases" />
      </StatGrid>

      <Panel title="Branches" titleId="dash-branches" bodyClassName="p-0" actions={<PanelLink to="/admin">Manage branches</PanelLink>}>
        <BranchTable rows={rows} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <RequestQueue isChief nowMs={nowMs} branchNameOf={branchNameOf} />
        <Panel title="Team" titleId="dash-team" bodyClassName="divide-y divide-slate-800 p-0" actions={<PanelLink to="/admin">Manage roles</PanelLink>}>
          <MemberGroup label="Branch Admins" addresses={members.admins} you={account} tagOf={branchTag} />
          <MemberGroup label="Investigators" addresses={members.investigators} you={account} tagOf={branchTag} />
          <MemberGroup label="Auditors" addresses={members.auditors} you={account} tagOf={branchTag} />
        </Panel>
      </div>

      <Panel title="Ledger status" titleId="dash-ledger" actions={<PanelLink to="/admin">Pause or resume</PanelLink>}>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          {paused ? <Badge tone="warning">Paused</Badge> : <Badge tone="success">Active</Badge>}
          <span>
            {reassignments.length === 0
              ? "No custody has been reassigned by the Chief."
              : `Custody has been reassigned by the Chief ${count(reassignments.length, "time")}; Auditors see each one as an exception.`}
          </span>
        </div>
      </Panel>

      <Panel title="Recent activity" titleId="dash-activity" bodyClassName="p-0" actions={<PanelLink to="/cases">All cases</PanelLink>}>
        <ActivityList entries={activityFeed(records, { limit: 8 })} directory={directory} you={account} nowMs={nowMs} />
      </Panel>
    </div>
  );
}

