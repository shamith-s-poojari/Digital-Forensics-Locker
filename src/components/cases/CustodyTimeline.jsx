import { ArrowRight, CheckCircle2, ExternalLink, Eye, FilePlus2, GitCompareArrows, Loader2, RefreshCcw, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { txUrl } from "../../web3/config.js";
import { ACTION_META } from "../../web3/caseModel.js";
import { formatUtc, sameAddress, shorten, timeAgo } from "../../web3/format.js";
import { Badge, CopyChip, Panel } from "../ui";

const ACTION_ICON = {
  Submitted: FilePlus2,
  Accessed: Eye,
  Transferred: ArrowRight,
  VerifiedMatch: ShieldCheck,
  VerifiedMismatch: ShieldAlert,
  Reassigned: RefreshCcw,
};

// Full class strings so Tailwind can see them.
const DOT = {
  info: "bg-sky-400",
  neutral: "bg-slate-400",
  warning: "bg-amber-400",
  success: "bg-emerald-400",
  danger: "bg-rose-400",
};

function ChainStatus({ status }) {
  if (status === "checking")
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs text-slate-300">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Checking the hash chain on the ledger…
      </span>
    );
  if (status === "intact")
    return (
      <Badge tone="success" icon={CheckCircle2}>
        Hash chain intact
      </Badge>
    );
  if (status === "broken")
    return (
      <Badge tone="danger" icon={XCircle}>
        HASH CHAIN BROKEN: custody entries do not match the stored head
      </Badge>
    );
  return <Badge tone="warning">Hash chain not checked</Badge>;
}

/**
 * The chain of custody of one evidence item, newest first, with who did what and when, and a link to the
 * transaction that recorded each step. The header shows the result of the ledger recomputing the hash chain.
 */
export default function CustodyTimeline({ record, account, txs, chainStatus, config }) {
  if (!record) {
    return (
      <Panel title="Chain of custody" titleId="timeline-heading">
        <p className="py-6 text-center text-sm text-slate-400">Select an evidence item to see who has held it.</p>
      </Panel>
    );
  }

  const entries = [...record.custody].reverse();

  return (
    <Panel title={`Chain of custody · #${record.id}`} titleId="timeline-heading" actions={<ChainStatus status={chainStatus} />}>
      <dl className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-slate-400">Current custodian</dt>
        <dd className="flex items-center gap-1.5 font-mono text-slate-100">
          {shorten(record.custodian, 8, 6)}
          {sameAddress(record.custodian, account) ? <Badge tone="info">you</Badge> : null}
        </dd>
        <dt className="text-slate-400">IPFS CID</dt>
        <dd className="min-w-0">
          <CopyChip value={record.cid} label={`CID of evidence ${record.id}`} textClassName="text-sky-200" />
        </dd>
        <dt className="text-slate-400">Custody head</dt>
        <dd className="min-w-0">
          <CopyChip value={record.custodyHead} display={shorten(record.custodyHead, 10, 8)} label="custody chain head" />
        </dd>
      </dl>

      <ol aria-label="Custody events, newest first" className="relative ml-1.5 space-y-5 border-l border-slate-700 pl-5">
        {entries.map((entry) => {
          const meta = ACTION_META[entry.action] ?? { label: entry.action, tone: "neutral" };
          const Icon = ACTION_ICON[entry.action] ?? GitCompareArrows;
          const tx = txs?.[entry.index];
          const href = tx ? txUrl(config, tx.txHash) : null;
          return (
            <li key={entry.index} className="relative">
              <span className={`absolute -left-[1.6rem] top-1.5 size-3 rounded-full ring-4 ring-slate-950 ${DOT[meta.tone]}`} aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge tone={meta.tone} icon={Icon}>
                  {meta.label}
                </Badge>
                <time dateTime={new Date(entry.timestamp * 1000).toISOString()} className="text-xs text-slate-300" title={formatUtc(entry.timestamp)}>
                  {formatUtc(entry.timestamp)} <span className="text-slate-400">({timeAgo(entry.timestamp)})</span>
                </time>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-300">
                by <span className="font-mono text-slate-100">{shorten(entry.actor, 6, 4)}</span>
                {sameAddress(entry.actor, account) ? <Badge tone="info">you</Badge> : null}
                {entry.counterparty ? (
                  <>
                    <ArrowRight className="size-3" aria-hidden="true" />
                    <span className="font-mono text-slate-100">{shorten(entry.counterparty, 6, 4)}</span>
                    {sameAddress(entry.counterparty, account) ? <Badge tone="info">you</Badge> : null}
                  </>
                ) : null}
              </p>
              {entry.noteHash ? <p className="mt-0.5 text-xs text-slate-400">Note hash {shorten(entry.noteHash, 8, 6)}</p> : null}
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-sky-300 underline underline-offset-2 hover:text-sky-200">
                  Transaction {shorten(tx.txHash, 8, 6)} · block {tx.blockNumber}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
