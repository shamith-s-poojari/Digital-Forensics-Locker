import { Activity, ExternalLink, FlaskConical, Layers, PauseCircle, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { useRole } from "../../context/roleContext.js";
import { useWallet } from "../../context/walletContext.js";
import { addressUrl } from "../../web3/config.js";
import { shorten } from "../../web3/format.js";
import { ROLE_LABELS, ROLES } from "../../web3/roles.js";
import { Badge, Button, CopyChip } from "../ui";

const ROLE_TONE = { [ROLES.ADMIN]: "warning", [ROLES.INVESTIGATOR]: "info", [ROLES.AUDITOR]: "neutral", [ROLES.NONE]: "danger" };

function Kpi({ icon: Icon, label, value, tone = "text-slate-100", hint, valueClass = "text-2xl" }) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className={`mt-1 truncate font-mono font-bold ${valueClass} ${tone}`}>{value}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

/**
 * Top strip of the dashboard: which network and contract the data comes from, who is looking and in what role,
 * whether writes are paused, and the headline numbers. In demo mode it also offers a role previewer.
 */
export default function DashboardHeader({ summary, paused, onRefresh, refreshing }) {
  const { role, config, mode } = useRole();
  const { account } = useWallet();
  const contractLink = addressUrl(config, config.address);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 id="dashboard-title" className="text-xl font-bold text-slate-50">
            Case Management
          </h1>
          <p className="text-sm text-slate-300">Evidence, chain of custody and content identifiers, read from the ledger.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={mode === "chain" ? "success" : "warning"} icon={mode === "chain" ? Activity : FlaskConical}>
            {mode === "chain" ? config.chainName : "In-browser ledger"}
          </Badge>
          {config.address ? (
            <span className="inline-flex items-center gap-1">
              <CopyChip value={config.address} display={shorten(config.address, 6, 4)} label="contract address" />
              {contractLink ? (
                <a href={contractLink} target="_blank" rel="noopener noreferrer" aria-label="Open contract on the block explorer" className="text-slate-400 hover:text-sky-300">
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              ) : null}
            </span>
          ) : null}
          <Badge tone={ROLE_TONE[role]} icon={Users}>
            {ROLE_LABELS[role]}
            {account ? <span className="font-mono text-[0.7rem] opacity-80">· {shorten(account, 4, 4)}</span> : null}
          </Badge>
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={refreshing} onClick={onRefresh} aria-label="Refresh from the ledger">
            Refresh
          </Button>
        </div>
      </div>

      {paused ? (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <PauseCircle className="size-4 shrink-0" aria-hidden="true" />
          The Chief has paused the ledger. Reading and verifying still work; registering evidence and logging custody are disabled until it is resumed.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Layers} label="Evidence items" value={summary.evidence} hint={`${summary.cases} case${summary.cases === 1 ? "" : "s"}`} />
        <Kpi icon={Activity} label="Custody events" value={summary.events} hint="recorded in order" />
        <Kpi
          icon={ShieldAlert}
          label="Hash mismatches"
          value={summary.mismatches}
          tone={summary.mismatches > 0 ? "text-rose-300" : "text-emerald-300"}
          hint={summary.mismatches > 0 ? "latest re-check disagreed with the ledger" : "none flagged"}
        />
        <Kpi icon={Users} label="Your access" value={ROLE_LABELS[role]} valueClass="text-lg leading-8" tone="text-sky-300" hint={role === ROLES.AUDITOR ? "read-only" : undefined} />
      </div>
    </div>
  );
}
