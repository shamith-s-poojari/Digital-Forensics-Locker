import { Link } from "react-router-dom";
import { FilePlus2, FolderOpen, Fingerprint } from "lucide-react";
import { ActivityList, DashboardIntro, EmptyNote, PanelLink, PausedNotice, StatGrid, StatTile } from "../../components/dashboard/parts";
import { Badge, Panel } from "../../components/ui";
import { activityFeed, caseCount, caseLabel, evidenceLink, inCustodyOf, receivedRecently, submittedBy } from "../../dashboard/dashboardModel.js";
import { INTEGRITY_META, integrityState, lastActivity } from "../../web3/caseModel.js";
import { formatUtc, timeAgo } from "../../web3/format.js";

const LINK_BUTTON = "inline-flex items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors";

/** Items in the viewer's custody: what they are answerable for right now. */
function CustodyTable({ items, directory, nowMs }) {
  if (items.length === 0) return <EmptyNote>Nothing is in your custody. Items you register or receive appear here.</EmptyNote>;
  return (
    <ul className="divide-y divide-slate-800">
      {items.map((r) => {
        const integrity = INTEGRITY_META[integrityState(r)];
        const last = lastActivity(r);
        return (
          <li key={r.id}>
            <Link to={evidenceLink(r)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-slate-900">
              <span className="font-medium text-sky-300">Evidence #{r.id}</span>
              <span className="text-slate-300">{caseLabel(directory, r.caseRef)}</span>
              <Badge tone={integrity.tone}>{integrity.label}</Badge>
              <time className="ml-auto text-xs text-slate-500" dateTime={new Date(last * 1000).toISOString()} title={formatUtc(last)}>
                {timeAgo(last, nowMs)}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * An Investigator's home: what is in their custody, what they registered, what was handed to them this week, and the
 * shortcuts to register evidence. With `embedded`, it is shown under another role's dashboard (a Chief or Admin who
 * also investigates) and drops its page heading.
 */
export default function InvestigatorDashboard({ records, paused, directory, account, nowMs, embedded = false }) {
  const custody = inCustodyOf(records, account);
  const mine = submittedBy(records, account);
  const received = receivedRecently(records, account, { nowSeconds: Math.floor(nowMs / 1000) });
  const myCases = caseCount([...custody, ...mine]);
  const mismatched = custody.filter((r) => integrityState(r) === "mismatch").length;

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Link to="/upload" className={`${LINK_BUTTON} border-sky-400 bg-sky-500 text-slate-950 hover:bg-sky-400`}>
        <FilePlus2 className="size-4" aria-hidden="true" />
        Register evidence
      </Link>
      <Link to="/cases" className={`${LINK_BUTTON} border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700`}>
        <FolderOpen className="size-4" aria-hidden="true" />
        Case management
      </Link>
    </div>
  );

  return (
    <div className="space-y-6">
      {embedded ? (
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Fingerprint className="size-5 text-sky-300" aria-hidden="true" />
          Your investigator work
        </h2>
      ) : (
        <>
          <DashboardIntro icon={Fingerprint} title="Investigator workbench">
            Register evidence, keep its custody trail up to date and hand it on with a recorded transfer. Every action is a
            transaction your wallet signs, so the ledger shows exactly who held what and when.
          </DashboardIntro>
          <PausedNotice paused={paused} />
        </>
      )}
      {actions}

      <StatGrid>
        <StatTile label="In my custody" value={custody.length} tone={custody.length ? "info" : "neutral"} />
        <StatTile label="Registered by me" value={mine.length} />
        <StatTile label="My cases" value={myCases} to="/cases" />
        <StatTile
          label="Received this week"
          value={received.length}
          tone={received.length ? "warning" : "neutral"}
          hint={mismatched ? `${mismatched} item${mismatched === 1 ? "" : "s"} in your custody failed a hash re-check` : "Handovers to you"}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`In my custody (${custody.length})`} titleId={embedded ? "dash-custody-embedded" : "dash-custody"} bodyClassName="p-0" actions={<PanelLink to="/cases">All cases</PanelLink>}>
          <CustodyTable items={custody} directory={directory} nowMs={nowMs} />
        </Panel>
        <Panel title="Handed to me this week" titleId={embedded ? "dash-received-embedded" : "dash-received"} bodyClassName="p-0">
          {received.length === 0 ? (
            <EmptyNote>No custody was transferred to you in the last 7 days.</EmptyNote>
          ) : (
            <ActivityList entries={received} directory={directory} you={account} nowMs={nowMs} />
          )}
        </Panel>
      </div>

      <Panel title="My recent activity" titleId={embedded ? "dash-mine-embedded" : "dash-mine"} bodyClassName="p-0">
        <ActivityList entries={activityFeed(records, { involving: account, limit: 8 })} directory={directory} you={account} nowMs={nowMs} />
      </Panel>
    </div>
  );
}
