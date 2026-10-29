import { Link } from "react-router-dom";
import { AlertTriangle, ScanSearch, ShieldAlert } from "lucide-react";
import { ActivityList, DashboardIntro, EmptyNote, PanelLink, PausedNotice, StatGrid, StatTile } from "../../components/dashboard/parts";
import { Badge, Panel } from "../../components/ui";
import { activityFeed, caseCount, caseLabel, evidenceLink, exceptions } from "../../dashboard/dashboardModel.js";
import { formatUtc, shorten, timeAgo } from "../../web3/format.js";

/** Failed hash re-checks and Chief overrides: the entries an independent reviewer should look at first. */
function ExceptionList({ mismatches, reassignments, directory, nowMs }) {
  if (mismatches.length === 0 && reassignments.length === 0) {
    return <EmptyNote>Nothing unusual: no failed hash re-checks and no custody reassigned by the Chief.</EmptyNote>;
  }
  return (
    <ul className="divide-y divide-slate-800">
      {mismatches.map((r) => (
        <li key={`m-${r.id}`}>
          <Link to={evidenceLink(r)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-slate-900">
            <Badge tone="danger" icon={AlertTriangle}>
              Hash mismatch
            </Badge>
            <span className="font-medium text-sky-300">Evidence #{r.id}</span>
            <span className="text-slate-400">{caseLabel(directory, r.caseRef)}</span>
            <span className="text-xs text-slate-400">The latest re-check did not match the registered hash.</span>
          </Link>
        </li>
      ))}
      {reassignments.map((e) => (
        <li key={`r-${e.key}`}>
          <Link
            to={evidenceLink({ caseRef: e.caseRef, id: e.evidenceId })}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-slate-900"
          >
            <Badge tone="warning" icon={ShieldAlert}>
              Chief override
            </Badge>
            <span className="font-medium text-sky-300">Evidence #{e.evidenceId}</span>
            <span className="text-slate-400">{caseLabel(directory, e.caseRef)}</span>
            <span className="font-mono text-xs text-slate-300">→ {shorten(e.counterparty ?? "")}</span>
            <time className="ml-auto text-xs text-slate-500" dateTime={new Date(e.timestamp * 1000).toISOString()} title={formatUtc(e.timestamp)}>
              {timeAgo(e.timestamp, nowMs)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * An Auditor's home: read-only. The size of the ledger, the exceptions to review first, and the full activity log.
 * Checking a file against the ledger and exporting a case record happen on Case Management.
 */
export default function AuditorDashboard({ records, paused, directory, account, nowMs }) {
  const { mismatches, reassignments, unchecked } = exceptions(records);
  const events = records.reduce((sum, r) => sum + r.custody.length, 0);

  return (
    <div className="space-y-6">
      <DashboardIntro icon={ScanSearch} title="Audit view">
        Read-only. You can see every case, item and custody step, check any file against its registered hash and export
        a case record a third party can verify. You cannot change anything on the ledger.
      </DashboardIntro>
      <PausedNotice paused={paused} />

      <StatGrid>
        <StatTile label="Cases" value={caseCount(records)} to="/cases" />
        <StatTile label="Evidence items" value={records.length} to="/cases" />
        <StatTile label="Custody events" value={events} />
        <StatTile label="Never re-checked" value={unchecked} tone={unchecked ? "warning" : "success"} hint="Items with no hash re-check on record" to="/cases" />
      </StatGrid>

      <Panel title={`Exceptions to review (${mismatches.length + reassignments.length})`} titleId="dash-exceptions" bodyClassName="p-0">
        <ExceptionList mismatches={mismatches} reassignments={reassignments} directory={directory} nowMs={nowMs} />
      </Panel>

      <Panel title="Activity log" titleId="dash-log" bodyClassName="p-0" actions={<PanelLink to="/cases">Verify a file</PanelLink>}>
        <ActivityList entries={activityFeed(records, { limit: 15 })} directory={directory} you={account} nowMs={nowMs} />
      </Panel>
    </div>
  );
}
