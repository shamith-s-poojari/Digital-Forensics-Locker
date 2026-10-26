import { useEffect, useId, useState } from "react";
import { ArrowRightLeft, Eye, FileSearch, ShieldCheck, ShieldX } from "lucide-react";
import { computeSHA256, formatFileSize, MAX_HASH_BYTES } from "../../utils/hash";
import { sameAddress, shorten } from "../../web3/format.js";
import { friendlyMessage } from "../../web3/ledgerErrors.js";
import { CAPABILITIES } from "../../web3/roles.js";
import Can from "../Can";
import { Badge, Button, CopyChip, Field, INPUT_CLASS, Panel, Spinner } from "../ui";

/** Read-only: hash a local file (keyed by evidence id by the caller, so a result never carries over to another item) and ask the ledger whether it equals the registered hash. Free, no wallet signature. */
function CheckFile({ record, ledger, paused, runWrite }) {
  const inputId = useId();
  const [state, setState] = useState({ phase: "idle", fileName: "", hash: "", matches: null, error: "" });

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_HASH_BYTES) {
      setState({ phase: "error", fileName: file.name, hash: "", matches: null, error: `This file is ${formatFileSize(file.size)}; the limit for in-browser hashing is ${formatFileSize(MAX_HASH_BYTES)}.` });
      return;
    }
    setState({ phase: "working", fileName: file.name, hash: "", matches: null, error: "" });
    try {
      const hash = await computeSHA256(file);
      const matches = await ledger.verifyHash(record.id, hash);
      setState({ phase: "done", fileName: file.name, hash, matches, error: "" });
    } catch (err) {
      setState({ phase: "error", fileName: file.name, hash: "", matches: null, error: friendlyMessage(err) });
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Check a file against the ledger" htmlFor={inputId} hint="Read-only. The file is hashed in your browser and never uploaded.">
        <input
          id={inputId}
          type="file"
          onChange={(e) => void onFile(e)}
          className={`${INPUT_CLASS} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-slate-100`}
        />
      </Field>

      <div aria-live="polite">
        {state.phase === "working" ? <Spinner label={`Hashing ${state.fileName}…`} /> : null}
        {state.phase === "error" ? (
          <p role="alert" className="text-sm text-rose-300">
            {state.error}
          </p>
        ) : null}
        {state.phase === "done" ? (
          <div className={`rounded-md border p-3 text-sm ${state.matches ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/50 bg-rose-500/10"}`}>
            <p className={`flex items-center gap-2 font-semibold ${state.matches ? "text-emerald-200" : "text-rose-200"}`}>
              {state.matches ? <ShieldCheck className="size-4" aria-hidden="true" /> : <ShieldX className="size-4" aria-hidden="true" />}
              {state.matches ? "This file's hash equals the hash registered on the ledger." : "This file's hash does NOT match the hash registered on the ledger."}
            </p>
            <p className="mt-1 text-xs text-slate-300">
              {state.fileName} · SHA-256 <CopyChip value={state.hash} display={shorten(state.hash, 10, 8)} label="computed SHA-256" />
            </p>
            <p className="mt-2 text-xs text-slate-400">
              A match shows only that this file equals what was registered. It cannot show the evidence was genuine before registration.
            </p>
            <Can capability={CAPABILITIES.LOG_CUSTODY}>
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                icon={FileSearch}
                disabled={paused}
                onClick={() => void runWrite("Record verification on the ledger", () => ledger.logVerification(record.id, state.hash))}
              >
                Record this result on the ledger
              </Button>
            </Can>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Investigator-only form that moves custody; the Chief uses the same form for emergency reassignment. */
function CustodyForm({ record, ledger, account, paused, runWrite, mode }) {
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [recipient, setRecipient] = useState("");
  const [loadError, setLoadError] = useState("");
  const reassign = mode === "reassign";

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    ledger
      .listRoleMembers()
      .then((members) => {
        if (cancelled) return;
        setRecipients(members.investigators.filter((a) => !sameAddress(a, record.custodian) && !sameAddress(a, account)));
        setLoadError("");
      })
      .catch((err) => !cancelled && setLoadError(friendlyMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [open, ledger, record.custodian, account]);

  if (!open) {
    return (
      <Button variant={reassign ? "danger" : "secondary"} icon={ArrowRightLeft} disabled={paused && !reassign} onClick={() => setOpen(true)}>
        {reassign ? "Reassign custody (Chief)" : "Transfer custody"}
      </Button>
    );
  }

  const send = () =>
    runWrite(reassign ? "Reassign custody" : "Transfer custody", () => (reassign ? ledger.reassignCustody(record.id, recipient) : ledger.transferCustody(record.id, recipient))).then((result) => {
      // Keep the form (and the chosen recipient) open when the transaction failed, so the user can retry.
      if (result.ok) {
        setOpen(false);
        setRecipient("");
      }
    });

  return (
    <div className="space-y-2 rounded-md border border-slate-600 bg-slate-900/70 p-3">
      <Field
        label={reassign ? "Reassign custody to" : "Transfer custody to"}
        htmlFor={selectId}
        hint={reassign ? "Use only when the custodian cannot act. This is recorded on the ledger as a reassignment by the Chief." : "Recipient must hold the Investigator role."}
        error={loadError}
      >
        <select id={selectId} value={recipient} onChange={(e) => setRecipient(e.target.value)} className={INPUT_CLASS}>
          <option value="">Choose an investigator…</option>
          {recipients.map((address) => (
            <option key={address} value={address}>
              {address}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={!recipient} onClick={() => void send()}>
          Confirm and sign
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Actions on the selected evidence item. Everyone who can view can check a file; writing actions appear only for the
 * roles that may perform them (the contract enforces this regardless of what is shown).
 */
export default function EvidenceActions({ record, ledger, account, paused, runWrite }) {
  if (!record) return null;
  const isCustodian = sameAddress(record.custodian, account);

  return (
    <Panel title="Actions" titleId="actions-heading">
      <div className="space-y-4">
        <CheckFile key={record.id} record={record} ledger={ledger} paused={paused} runWrite={runWrite} />

        <Can capability={CAPABILITIES.LOG_CUSTODY}>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
            <Button icon={Eye} disabled={paused} onClick={() => void runWrite("Log access", () => ledger.logAccess(record.id))}>
              Log that I accessed this
            </Button>
            {isCustodian ? (
              <Can capability={CAPABILITIES.TRANSFER}>
                <CustodyForm key={`transfer-${record.id}`} record={record} ledger={ledger} account={account} paused={paused} runWrite={runWrite} mode="transfer" />
              </Can>
            ) : (
              <Badge tone="neutral">Only the custodian can transfer</Badge>
            )}
          </div>
        </Can>

        <Can capability={CAPABILITIES.REASSIGN}>
          <div className="border-t border-slate-800 pt-3">
            <CustodyForm key={`reassign-${record.id}`} record={record} ledger={ledger} account={account} paused={paused} runWrite={runWrite} mode="reassign" />
          </div>
        </Can>
      </div>
    </Panel>
  );
}
