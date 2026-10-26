import { ExternalLink } from "lucide-react";
import { INTEGRITY_META, integrityState, lastActivity } from "../../web3/caseModel.js";
import { sameAddress, shorten, timeAgo } from "../../web3/format.js";
import { Badge, CopyChip, Panel } from "../ui";

const gatewayUrl = (cid) => `https://ipfs.io/ipfs/${encodeURIComponent(cid)}`;

/**
 * Evidence of the selected case. The content identifier (CID) and SHA-256 are shown as copyable chips in every row,
 * since they are what an investigator pastes into other tools.
 */
export default function EvidenceTable({ group, selectedId, onSelect, account }) {
  const title = group ? `Evidence · ${group.label}` : "Evidence";

  return (
    <Panel title={title} titleId="evidence-heading" bodyClassName="p-0">
      {!group ? (
        <p className="p-6 text-center text-sm text-slate-400">Select a case to see its evidence.</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Evidence table, scrolls sideways on small screens">
          {group.title ? <p className="border-b border-slate-800 px-4 py-2 text-sm text-slate-200">{group.title}</p> : null}
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Evidence items in {group.label}. Select a row to see its custody timeline.</caption>
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                <th scope="col" className="px-4 py-2 font-semibold">
                  ID
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  SHA-256
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  IPFS CID
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Custodian
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Integrity
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Last event
                </th>
              </tr>
            </thead>
            <tbody>
              {group.evidence.map((record) => {
                const selected = record.id === selectedId;
                const integrity = INTEGRITY_META[integrityState(record)];
                return (
                  <tr key={record.id} className={`border-b border-slate-800 ${selected ? "bg-sky-500/10" : "hover:bg-slate-900/70"}`}>
                    <th scope="row" className="px-4 py-2 font-normal">
                      <button
                        type="button"
                        onClick={() => onSelect(record.id)}
                        aria-current={selected ? "true" : undefined}
                        aria-label={`Evidence ${record.id}, show custody timeline`}
                        className={`rounded border px-2 py-1 font-mono text-xs font-bold ${
                          selected ? "border-sky-400 bg-sky-500/20 text-sky-100" : "border-slate-600 text-slate-200 hover:border-sky-400"
                        }`}
                      >
                        #{record.id}
                      </button>
                    </th>
                    <td className="px-2 py-2">
                      <CopyChip value={record.sha256} display={shorten(record.sha256, 8, 6)} label={`SHA-256 of evidence ${record.id}`} />
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1">
                        <CopyChip value={record.cid} display={shorten(record.cid, 10, 6)} label={`CID of evidence ${record.id}`} textClassName="text-sky-200" />
                        <a
                          href={gatewayUrl(record.cid)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open CID of evidence ${record.id} in a public IPFS gateway`}
                          className="text-slate-400 hover:text-sky-300"
                        >
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-slate-200">
                      {shorten(record.custodian, 6, 4)}
                      {sameAddress(record.custodian, account) ? <span className="ml-1 rounded bg-sky-500/20 px-1 text-[0.65rem] font-sans font-semibold text-sky-200">you</span> : null}
                    </td>
                    <td className="px-2 py-2">
                      <Badge tone={integrity.tone}>{integrity.label}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-300">{timeAgo(lastActivity(record))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
