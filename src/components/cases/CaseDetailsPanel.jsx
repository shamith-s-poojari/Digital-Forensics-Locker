import { useId, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock3, Pencil, XCircle } from "lucide-react";
import { deriveCaseRef, shorten } from "../../web3/format.js";
import { CAPABILITIES } from "../../web3/roles.js";
import { checkCaseAnchors } from "../../verify/verifyCaseDetails.js";
import Can from "../Can";
import { Badge, Button, Field, INPUT_CLASS, Panel, Spinner } from "../ui";

function AnchorStatus({ check }) {
  if (check.status === "verified")
    return (
      <Badge tone="success" icon={CheckCircle2}>
        Case details match the version anchored on chain (v{check.current.version})
      </Badge>
    );
  if (check.status === "pending")
    return (
      <Badge tone="warning" icon={Clock3}>
        Edited since the last record: v{check.current.version} is not anchored yet
      </Badge>
    );
  if (check.status === "tampered")
    return (
      <Badge tone="danger" icon={XCircle}>
        CASE DETAILS DO NOT MATCH WHAT WAS ANCHORED
      </Badge>
    );
  if (check.status === "no-details") return <Badge tone="warning">No case details in the store for this case</Badge>;
  return null;
}

/** Title + description form, for a first version (asks the case number too) or a new version. */
function DetailsForm({ initial, needsCaseNumber, caseRef, onSave, onCancel }) {
  const ids = { number: useId(), title: useId(), description: useId() };
  const [caseNumber, setCaseNumber] = useState("");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (needsCaseNumber) {
      // The case number is not on chain; it must be the one this case's reference was derived from.
      let derived = null;
      try {
        derived = deriveCaseRef(caseNumber);
      } catch {
        /* empty */
      }
      if (derived !== caseRef) {
        setError("That case number does not belong to this case (its reference differs).");
        return;
      }
    }
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ caseNumber, title, description });
    } catch (err) {
      setError(err?.message ?? "Could not save the case details.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-md border border-slate-600 bg-slate-900/70 p-3" noValidate>
      {needsCaseNumber ? (
        <Field label="Case number" htmlFor={ids.number} hint="The case number this case's evidence was registered under.">
          <input id={ids.number} value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
        </Field>
      ) : null}
      <Field label="Case title" htmlFor={ids.title}>
        <input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} maxLength={200} autoComplete="off" />
      </Field>
      <Field label="Description" htmlFor={ids.description} hint="Kept off chain. A salted digest of the title and description is anchored with the next evidence record.">
        <textarea id={ids.description} value={description} onChange={(e) => setDescription(e.target.value)} className={`${INPUT_CLASS} min-h-20`} maxLength={4000} />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" loading={saving}>
          Save as a new version
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The selected case's off-chain details (title, description) and whether they still match the digests its evidence
 * records anchored on chain (src/verify/verifyCaseDetails.js). Investigators can edit them; an edit is a new version,
 * never a change to an old one, and is anchored by the next record registered in the case.
 */
export default function CaseDetailsPanel({ group, directory }) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const entry = group ? directory.byRef.get(group.caseRef) ?? null : null;
  const check = useMemo(() => (group && directory.status === "ready" ? checkCaseAnchors(entry, group.evidence) : null), [group, entry, directory.status]);
  if (!group) return null;

  const current = entry?.versions.at(-1) ?? null;
  const anchorsOf = new Map((check?.versions ?? []).map((v) => [v.version, v]));

  async function save(fields) {
    if (entry) await directory.addVersion(entry.caseRef, fields);
    else await directory.create(fields);
    setEditing(false);
  }

  return (
    <Panel title="Case details" titleId="case-details-heading">
      <div className="space-y-3 text-sm">
        {directory.status === "loading" ? <Spinner label="Reading the case store…" /> : null}
        {directory.status === "unavailable" ? <p className="text-slate-400">No case store is connected, so titles and descriptions cannot be shown.</p> : null}
        {directory.status === "signed-out" ? <p className="text-amber-200">Sign in with your wallet to read case titles and descriptions.</p> : null}
        {directory.status === "error" ? (
          <p role="alert" className="text-rose-300">
            {directory.error}
          </p>
        ) : null}

        {directory.status === "ready" ? (
          <>
            {current ? (
              <div>
                <p className="font-semibold text-slate-100">{current.title}</p>
                {current.description ? <p className="mt-1 whitespace-pre-line text-slate-300">{current.description}</p> : null}
              </div>
            ) : null}

            {check ? (
              <div role="status" className="flex flex-wrap items-center gap-2">
                <AnchorStatus check={check} />
              </div>
            ) : null}

            {check?.status === "tampered" ? (
              <div className="flex items-start gap-2 rounded-md border border-rose-500/50 bg-rose-500/10 p-2 text-rose-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <ul className="space-y-1">
                  {check.orphans.map((o) => (
                    <li key={o.id}>
                      Evidence #{o.id} anchored case details (digest {shorten(o.caseDigest ?? "none", 8, 6)}) that no stored version reproduces. The stored history
                      was edited, or a version was removed, after it was anchored.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {check?.status === "pending" ? (
              <p className="text-xs text-slate-400">The new version will be anchored by the next evidence record registered in this case. Earlier records keep the version they anchored.</p>
            ) : null}

            {entry ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-expanded={showHistory}
                  className="inline-flex items-center gap-1 rounded px-1 text-xs text-sky-300 underline-offset-2 hover:underline"
                >
                  {showHistory ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                  Version history ({entry.versions.length})
                </button>
                {showHistory ? (
                  <ol className="mt-2 space-y-1.5" aria-label="Case details versions">
                    {[...entry.versions].reverse().map((v) => {
                      const a = anchorsOf.get(v.version);
                      return (
                        <li key={v.version} className="text-xs text-slate-300">
                          <span className="font-semibold text-slate-100">v{v.version}</span> · {v.title} · {v.editedAt?.slice(0, 10)} by {v.editedBy ? shorten(v.editedBy) : "unknown"} ·{" "}
                          {a?.anchoredBy.length ? <span className="text-emerald-300">anchored by evidence #{a.anchoredBy.join(", #")}</span> : <span className="text-slate-500">not anchored</span>}
                          {a && !a.storedDigestMatches ? <span className="ml-1 font-semibold text-rose-300">stored digest differs from its fields</span> : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </div>
            ) : null}

            <Can capability={CAPABILITIES.UPLOAD}>
              {editing ? (
                <DetailsForm initial={current} needsCaseNumber={!entry} caseRef={group.caseRef} onSave={save} onCancel={() => setEditing(false)} />
              ) : (
                <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>
                  {entry ? "Edit case details" : "Add case details"}
                </Button>
              )}
            </Can>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
