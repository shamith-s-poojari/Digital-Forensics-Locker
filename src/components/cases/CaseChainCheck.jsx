import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Link2, XCircle } from "lucide-react";
import { walkCaseChain } from "../../verify/verifyCase.js";
import { shorten } from "../../web3/format.js";
import { Badge, Panel } from "../ui";

const STEP_LABEL = {
  ok: "link verified",
  "link-mismatch": "LINK MISMATCH",
  "wrong-case": "WRONG CASE",
  "out-of-order": "MISSING OR OUT OF ORDER",
  unreadable: "UNREADABLE",
  "not-checked": "not checked (after the first failure)",
};

/**
 * The case chain of the selected case, re-walked in this browser: every record's link is recomputed from its own
 * fields and the previous link (src/verify/verifyCase.js), stopping at the first mismatch. This does not ask the
 * contract; it re-derives the result from the record data itself.
 */
export default function CaseChainCheck({ group }) {
  const [open, setOpen] = useState(false);
  const result = useMemo(() => (group ? walkCaseChain(group.caseRef, group.evidence) : null), [group]);
  if (!group || !result) return null;

  const byIndex = group.evidence.reduce((map, e) => map.set(e.id, e), new Map());

  return (
    <Panel title="Case chain" titleId="case-chain-heading">
      <div className="space-y-3 text-sm">
        <div role="status" className="flex flex-wrap items-center gap-2">
          {result.ok ? (
            <Badge tone="success" icon={CheckCircle2}>
              Case chain intact: all {result.total} {result.total === 1 ? "record" : "records"} re-linked in your browser
            </Badge>
          ) : (
            <Badge tone="danger" icon={XCircle}>
              CASE CHAIN BROKEN at position {result.firstBad.index} (evidence #{result.firstBad.id})
            </Badge>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded px-1 text-xs text-sky-300 underline-offset-2 hover:underline"
          >
            {open ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
            {open ? "Hide the walk" : "Show the walk"}
          </button>
        </div>

        {!result.ok ? (
          <p className="text-rose-200">
            Evidence #{result.firstBad.id}: {result.firstBad.message}. Every later record depends on this link and was not checked.
          </p>
        ) : null}

        {open ? (
          <ol className="space-y-1.5" aria-label="Case chain walk">
            {result.steps.map((step, i) => (
              <li key={step.id} data-status={step.status} className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <Link2 className={`size-3.5 ${step.status === "ok" ? "text-emerald-300" : step.status === "not-checked" ? "text-slate-500" : "text-rose-300"}`} aria-hidden="true" />
                <span className="font-semibold text-slate-100">
                  #{i} · evidence #{step.id}
                </span>
                <span className="font-mono">h = {shorten(step.stored, 8, 6)}</span>
                <span className={step.status === "ok" ? "text-emerald-300" : step.status === "not-checked" ? "text-slate-500" : "font-semibold text-rose-300"}>{STEP_LABEL[step.status]}</span>
                {step.status === "link-mismatch" ? <span className="font-mono text-rose-200">expected {shorten(step.expected, 8, 6)}</span> : null}
                <span className="text-slate-500">{shorten(byIndex.get(step.id)?.cid, 8, 6)}</span>
              </li>
            ))}
          </ol>
        ) : null}

        <p className="text-xs text-slate-400">
          h<sub>0</sub> = SHA256(case id), h<sub>i</sub> = SHA256(h<sub>i-1</sub> ‖ evidence hash ‖ CID ‖ officer ‖ block time). Recomputed here from the record data,
          independently of the contract.
        </p>
      </div>
    </Panel>
  );
}
