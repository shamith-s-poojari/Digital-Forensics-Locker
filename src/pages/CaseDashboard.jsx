import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Download, FilePlus2, Inbox } from "lucide-react";
import Can from "../components/Can";
import CaseChainCheck from "../components/cases/CaseChainCheck";
import CaseDetailsPanel from "../components/cases/CaseDetailsPanel";
import CaseList from "../components/cases/CaseList";
import CustodyTimeline from "../components/cases/CustodyTimeline";
import DashboardHeader from "../components/cases/DashboardHeader";
import EvidenceActions from "../components/cases/EvidenceActions";
import EvidenceTable from "../components/cases/EvidenceTable";
import WriteActivity from "../components/WriteActivity";
import { Button, Panel, Spinner } from "../components/ui";
import { useCaseDirectory } from "../cases/caseDirectoryContext.js";
import { useWallet } from "../context/walletContext.js";
import { downloadJson, safeFileName } from "../utils/download";
import { buildCaseExport, directoryFromCases, groupByCase, matchesQuery, summarize } from "../web3/caseModel.js";
import { useLedger } from "../web3/ledgerContext.js";
import { CAPABILITIES } from "../web3/roles.js";
import { useEvidence } from "../web3/useEvidence.js";
import { useWriteFlow } from "../web3/useWriteFlow.js";

/**
 * Case Management Dashboard.
 *
 * Reads every evidence record and custody trail from the ledger (the contract on a real chain, or the in-memory
 * demo in development) and lets each role do only what its role allows:
 *   Auditor       view, search, check a file against the ledger (read-only)
 *   Investigator  + log access, record verification, transfer custody
 *   Chief       + reassign stranded custody (role management lives on /admin)
 * Hidden buttons are a courtesy; the contract rejects anything the wallet is not entitled to do.
 */
export default function CaseDashboard() {
  const { ledger, mode, config } = useLedger();
  const { account } = useWallet();
  const { status, records, paused, error, version, reload } = useEvidence();

  const [query, setQuery] = useState("");
  // Dashboards link straight to an item with /cases?case=<caseRef>&evidence=<id>.
  const [params] = useSearchParams();
  const [selection, setSelection] = useState(() => ({ caseRef: params.get("case"), id: Number(params.get("evidence")) || null }));
  const [refreshing, setRefreshing] = useState(false);

  const write = useWriteFlow({ config, onConfirmed: reload });
  const { runWrite } = write;

  const directory = useCaseDirectory();
  const groups = useMemo(() => groupByCase(records, directoryFromCases(directory.cases)), [records, directory.cases]);
  const visible = useMemo(() => groups.filter((g) => matchesQuery(g, query)), [groups, query]);
  const summary = useMemo(() => summarize(records), [records]);

  // The effective selection falls back to the first visible case/item, so it never points at something filtered out.
  const group = visible.find((g) => g.caseRef === selection.caseRef) ?? visible[0] ?? null;
  const record = group?.evidence.find((e) => e.id === selection.id) ?? group?.evidence[0] ?? null;

  // Ledger-side checks for the selected item: does the stored custody chain recompute to its head, and which
  // transactions recorded each step. Results are tied to the exact state they were computed for.
  // `version` changes on every load, so pressing Refresh asks the ledger to re-check the chain again.
  const detailKey = ledger && record ? `${ledger.kind}:${record.id}:${record.custodyHead}:${version}` : null;
  const [detail, setDetail] = useState({ key: null, chainStatus: "checking", txs: {} });
  useEffect(() => {
    if (!detailKey) return undefined;
    let cancelled = false;
    ledger
      .verifyChain(record.id)
      .then((ok) => !cancelled && setDetail((d) => ({ key: detailKey, chainStatus: ok ? "intact" : "broken", txs: d.key === detailKey ? d.txs : {} })))
      .catch(() => !cancelled && setDetail((d) => ({ key: detailKey, chainStatus: "error", txs: d.key === detailKey ? d.txs : {} })));
    ledger
      .getCustodyTxs(record.id)
      .then((txs) => !cancelled && setDetail((d) => ({ key: detailKey, chainStatus: d.key === detailKey ? d.chainStatus : "checking", txs })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detailKey, ledger, record?.id]);
  const detailFresh = detail.key === detailKey;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  function onExport() {
    if (!group) return;
    const data = buildCaseExport({ group, config, mode, caseEntry: directory.byRef.get(group.caseRef) ?? null });
    downloadJson(`case-record-${safeFileName(group.caseNumber ?? group.caseRef.slice(0, 18))}.json`, data);
  }

  return (
    <div className="mx-auto max-w-[110rem] space-y-4">
      <DashboardHeader summary={summary} paused={paused} onRefresh={onRefresh} refreshing={refreshing || status === "loading"} />

      {status === "loading" || status === "idle" ? (
        <div className="py-16 text-center">
          <Spinner label="Reading evidence from the ledger…" />
        </div>
      ) : null}

      {status === "error" ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Could not read the ledger.</p>
            <p>{error}</p>
            <Button className="mt-2" size="sm" onClick={() => void onRefresh()}>
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {status === "ready" && records.length === 0 ? (
        <Panel bodyClassName="px-6 py-14 text-center">
          <Inbox className="mx-auto size-10 text-slate-500" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-slate-100">No evidence on the ledger yet</h2>
          <p className="mt-1 text-sm text-slate-300">Evidence appears here, with its full chain of custody, once an investigator registers it.</p>
          <Can capability={CAPABILITIES.UPLOAD}>
            <Link
              to="/upload"
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 no-underline hover:bg-sky-400"
            >
              <FilePlus2 className="size-4" aria-hidden="true" />
              Register the first evidence item
            </Link>
          </Can>
        </Panel>
      ) : null}

      {status === "ready" && records.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_25rem]">
          <div className="space-y-3">
            <CaseList groups={visible} selectedRef={group?.caseRef ?? null} onSelect={(caseRef) => setSelection({ caseRef, id: null })} query={query} onQueryChange={setQuery} />
            {group ? (
              <Button className="w-full" icon={Download} onClick={onExport}>
                Export case record (JSON)
              </Button>
            ) : null}
            <Can capability={CAPABILITIES.UPLOAD}>
              <Link
                to="/upload"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-sky-400 bg-sky-500 px-3.5 py-2 text-sm font-semibold text-slate-950 no-underline hover:bg-sky-400"
              >
                <FilePlus2 className="size-4" aria-hidden="true" />
                Register evidence
              </Link>
            </Can>
          </div>

          <div className="min-w-0 space-y-4">
            <CaseDetailsPanel group={group} directory={directory} />
            <CaseChainCheck group={group} />
            <EvidenceTable group={group} selectedId={record?.id ?? null} onSelect={(id) => setSelection({ caseRef: group.caseRef, id })} account={account} />
            <EvidenceActions record={record} ledger={ledger} account={account} paused={paused} runWrite={runWrite} />
          </div>

          <div className="min-w-0 lg:col-span-2 xl:col-span-1">
            <div className="xl:sticky xl:top-20">
              <CustodyTimeline
                record={record}
                account={account}
                config={config}
                txs={detailFresh ? detail.txs : undefined}
                chainStatus={detailFresh ? detail.chainStatus : "checking"}
              />
            </div>
          </div>
        </div>
      ) : null}

      <WriteActivity title={write.title} steps={write.steps} isIdle={write.isIdle} isRunning={write.isRunning} onDismiss={write.dismiss} />
    </div>
  );
}
