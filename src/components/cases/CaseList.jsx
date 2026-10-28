import { FolderOpen, Search } from "lucide-react";
import { timeAgo } from "../../web3/format.js";
import { INPUT_CLASS, Panel } from "../ui";

/** Searchable list of cases (evidence grouped by case reference). */
export default function CaseList({ groups, selectedRef, onSelect, query, onQueryChange }) {
  return (
    <Panel title="Cases" titleId="cases-heading" bodyClassName="p-3">
      <label htmlFor="case-search" className="sr-only">
        Search cases, hashes, CIDs or addresses
      </label>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id="case-search"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Case, hash, CID or address"
          className={`${INPUT_CLASS} pl-8`}
          autoComplete="off"
        />
      </div>

      {groups.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-slate-400">{query ? "No case matches that search." : "No cases yet."}</p>
      ) : (
        <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
          {groups.map((group) => {
            const selected = group.caseRef === selectedRef;
            return (
              <li key={group.caseRef}>
                <button
                  type="button"
                  onClick={() => onSelect(group.caseRef)}
                  aria-current={selected ? "true" : undefined}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    selected ? "border-sky-400 bg-sky-500/10" : "border-slate-700 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className={`size-4 shrink-0 ${selected ? "text-sky-300" : "text-slate-400"}`} aria-hidden="true" />
                    <span className="truncate font-mono text-sm font-semibold text-slate-100">{group.label}</span>
                    {group.mismatches > 0 ? (
                      <span className="ml-auto shrink-0 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[0.65rem] font-bold text-rose-200">
                        {group.mismatches}
                        <span className="sr-only"> hash mismatch{group.mismatches === 1 ? "" : "es"}</span>
                      </span>
                    ) : null}
                  </span>
                  {group.title ? <span className="mt-0.5 block truncate text-xs text-slate-300">{group.title}</span> : null}
                  <span className="mt-1 block text-xs text-slate-400">
                    {group.evidence.length} item{group.evidence.length === 1 ? "" : "s"} · active {timeAgo(group.lastActivity)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
