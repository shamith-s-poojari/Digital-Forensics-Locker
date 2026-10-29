import { Link } from "react-router-dom";
import { ArrowRight, Building2, PauseCircle } from "lucide-react";
import { useAccessRequests } from "../../access/accessRequestContext.js";
import { caseLabel, evidenceLink } from "../../dashboard/dashboardModel.js";
import { ACTION_META } from "../../web3/caseModel.js";
import { formatUtc, sameAddress, shorten, timeAgo } from "../../web3/format.js";
import { ROLE_LABELS } from "../../web3/roles.js";
import { Badge, CopyChip, Panel } from "../ui";

/*
 * Building blocks shared by the role dashboards (src/pages/dashboards/). They only show and link: every change
 * (granting a role, a custody transfer, an upload) happens on the page that already runs that transaction.
 */

const TILE_TONES = {
  neutral: "text-slate-100",
  info: "text-sky-200",
  success: "text-emerald-200",
  warning: "text-amber-200",
  danger: "text-rose-200",
};

/** The page heading for a role's dashboard. `branch`: the branch name to show next to it, if the role has one. */
export function DashboardIntro({ icon: Icon, title, branch, children }) {
  return (
    <header className="flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-50">{title}</h1>
          {branch ? (
            <Badge tone="info" icon={Building2}>
              {branch}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 max-w-prose text-sm text-slate-400">{children}</p>
      </div>
    </header>
  );
}

/** One number with its label. With `to`, the whole tile is a link to where that number can be acted on. */
export function StatTile({ label, value, tone = "neutral", hint, to }) {
  const body = (
    <>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`mt-1 block text-3xl font-bold tabular-nums ${TILE_TONES[tone]}`}>{value}</span>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </>
  );
  const base = "block rounded-lg border border-slate-700/70 bg-slate-950/60 p-4";
  return to ? (
    <Link to={to} className={`${base} transition-colors hover:border-sky-500/60 hover:bg-slate-900`}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

export function StatGrid({ children }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

/** Writes are blocked while the ledger is paused; every dashboard says so first. */
export function PausedNotice({ paused }) {
  if (!paused) return null;
  return (
    <p role="status" className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
      <PauseCircle className="size-4 shrink-0" aria-hidden="true" />
      The ledger is paused: evidence can be viewed but not registered, accessed or transferred until it is resumed.
    </p>
  );
}

export function EmptyNote({ children }) {
  return <p className="px-4 py-6 text-center text-sm text-slate-400">{children}</p>;
}

/** A link styled as a panel action. */
export function PanelLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200">
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/** Who did what to which item, newest first. `you` marks the viewer's own address; `nowMs` anchors "x ago". */
export function ActivityList({ entries, directory, you, nowMs }) {
  if (entries.length === 0) return <EmptyNote>No custody activity yet.</EmptyNote>;
  const who = (address) => (sameAddress(address, you) ? "You" : shorten(address));
  return (
    <ul className="divide-y divide-slate-800">
      {entries.map((e) => {
        const meta = ACTION_META[e.action] ?? { label: e.action, tone: "neutral" };
        return (
          <li key={e.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Link to={evidenceLink({ caseRef: e.caseRef, id: e.evidenceId })} className="font-medium text-sky-300 hover:text-sky-200">
              Evidence #{e.evidenceId}
            </Link>
            <span className="text-slate-400">{caseLabel(directory, e.caseRef)}</span>
            <span className="font-mono text-xs text-slate-300">
              {who(e.actor)}
              {e.counterparty ? ` → ${who(e.counterparty)}` : ""}
            </span>
            <time className="ml-auto text-xs text-slate-500" dateTime={new Date(e.timestamp * 1000).toISOString()} title={formatUtc(e.timestamp)}>
              {timeAgo(e.timestamp, nowMs)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

/** One role's holders, with copyable addresses. `tagOf(address)`: an optional label (such as the branch) per holder. */
export function MemberGroup({ label, addresses, you, tagOf }) {
  return (
    <div className="px-4 py-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
        <Badge>{addresses.length}</Badge>
      </p>
      {addresses.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {addresses.map((a) => (
            <li key={a} className="flex items-center gap-1.5">
              <CopyChip value={a} display={shorten(a)} label={`${label} address`} />
              {tagOf ? <span className="text-xs text-slate-400">{tagOf(a)}</span> : null}
              {sameAddress(a, you) ? <Badge tone="info">you</Badge> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Pending access requests the viewer may decide, read-only. The list arrives already narrowed (accessRequestStores.js
 * `isRequestInScope`): the Chief sees every branch's, a Branch Admin only its own branch's working-role requests.
 * Approving grants a role on chain, so the decision itself is made on Role Management, which runs the transaction.
 * `branchNameOf(id)`: shows the branch each request is for (the Chief's view spans branches).
 */
export function RequestQueue({ isChief, nowMs, branchNameOf }) {
  const requests = useAccessRequests();
  if (requests.status === "unavailable") return null;
  const pending = requests.pending;
  return (
    <Panel title={`Access requests (${pending.length})`} titleId="dash-requests" bodyClassName="p-0" actions={<PanelLink to="/admin">Review</PanelLink>}>
      {requests.status === "loading" ? (
        <EmptyNote>Loading requests…</EmptyNote>
      ) : requests.status === "error" ? (
        <p role="alert" className="px-4 py-3 text-sm text-rose-200">
          {requests.error}
        </p>
      ) : pending.length === 0 ? (
        <EmptyNote>No wallet is waiting for a role.</EmptyNote>
      ) : (
        <ul className="divide-y divide-slate-800">
          {pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <CopyChip value={r.address} display={shorten(r.address)} label="requesting address" />
              <span className="text-slate-200">
                wants <strong>{ROLE_LABELS[r.role] ?? r.role}</strong>
              </span>
              {branchNameOf && r.branchId ? <Badge icon={Building2}>{branchNameOf(r.branchId)}</Badge> : null}
              {r.role === "admin" && isChief ? <Badge tone="warning">Only you can decide</Badge> : null}
              {r.reason ? <span className="w-full text-xs text-slate-400 sm:w-auto">“{r.reason}”</span> : null}
              <time className="ml-auto text-xs text-slate-500" dateTime={r.createdAt} title={r.createdAt}>
                {timeAgo(Date.parse(r.createdAt) / 1000, nowMs)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
