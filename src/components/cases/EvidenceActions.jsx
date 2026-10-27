import { useEffect, useId, useState } from "react";
import { ArrowRightLeft, CloudDownload, Download, Eye, FileSearch, ShieldCheck, ShieldX } from "lucide-react";
import { useWallet } from "../../context/walletContext.js";
import { keyClient as defaultKeyClient } from "../../crypto/keyClient.js";
import { downloadBytes } from "../../utils/download.js";
import { formatFileSize } from "../../utils/hash";
import { MAX_VERIFY_BYTES, openAndHash, verifyStoredCopy } from "../../verify/verifyEvidence.js";
import { lockerConfig } from "../../web3/config.js";
import { sameAddress, shorten } from "../../web3/format.js";
import { friendlyMessage, LedgerError } from "../../web3/ledgerErrors.js";
import { CAPABILITIES } from "../../web3/roles.js";
import Can from "../Can";
import { Badge, Button, CopyChip, Field, INPUT_CLASS, Panel, Spinner } from "../ui";

const IDLE = { phase: "idle", source: "", hash: "", matches: null, error: "", detail: "", decrypted: null, encrypted: false };

/** Ledger errors get the ledger's plain-language wording; the key server, gateways and decryption already speak plainly. */
const describe = (err) => (err instanceof LedgerError || !err?.message ? friendlyMessage(err) : err.message);

/**
 * Verifies one evidence item (keyed by evidence id by the caller, so a result never carries over to another item):
 * get the bytes, open them if they are an encrypted copy, hash the ORIGINAL bytes in the browser, and ask the ledger
 * whether that hash is the registered one. Two sources:
 *
 * - "Fetch from IPFS": the stored copy, by the CID on the ledger, from public gateways. A gateway cannot make a check
 *   pass: the copy is authenticated by its decryption and the hash is compared with the chain.
 * - A local file: the original file or an encrypted copy. An original file needs no sign-in.
 *
 * Opening an encrypted copy needs a current sign-in to fetch its key, and the key server logs that.
 */
function CheckFile({ record, ledger, paused, runWrite, keyClient, gateways }) {
  const inputId = useId();
  const { ensureSession } = useWallet();
  const [state, setState] = useState(IDLE);
  const onStage = (detail) => setState((s) => ({ ...s, detail }));

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_VERIFY_BYTES) {
      setState({ ...IDLE, phase: "error", source: file.name, error: `This file is ${formatFileSize(file.size)}; the limit for in-browser hashing is 10.00 MB.` });
      return;
    }
    setState({ ...IDLE, phase: "working", source: file.name, detail: `Reading ${file.name}…` });
    try {
      const opened = await openAndHash(new Uint8Array(await file.arrayBuffer()), { ensureSession, keyClient, onStage });
      onStage("Comparing with the hash on the ledger…");
      const matches = await ledger.verifyHash(record.id, opened.sha256);
      setState({ ...IDLE, phase: "done", source: file.name, hash: opened.sha256, matches, decrypted: opened.plaintext, encrypted: opened.encrypted });
    } catch (err) {
      setState({ ...IDLE, phase: "error", source: file.name, error: describe(err) });
    }
  }

  async function onFetch() {
    setState({ ...IDLE, phase: "working", source: "IPFS", detail: "Fetching the stored copy…" });
    try {
      const result = await verifyStoredCopy({ record, ledger, gateways, ensureSession, keyClient, onStage });
      const source = `Stored copy ${shorten(record.cid, 10, 6)} via ${new URL(result.gateway).host}`;
      setState({ ...IDLE, phase: "done", source, hash: result.sha256, matches: result.matches, decrypted: result.plaintext, encrypted: result.encrypted });
    } catch (err) {
      setState({ ...IDLE, phase: "error", source: "IPFS", error: describe(err) });
    }
  }

  const working = state.phase === "working";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={CloudDownload} disabled={working} onClick={() => void onFetch()}>
          Fetch from IPFS and verify
        </Button>
        <span className="text-xs text-slate-400">Downloads the stored copy by its CID, opens it, hashes it here and compares with the ledger.</span>
      </div>

      <Field
        label="Check a file against the ledger"
        htmlFor={inputId}
        hint="The original file or the encrypted copy from IPFS. Everything happens in your browser; nothing is uploaded. An encrypted copy needs your sign-in to fetch its key, and the key server logs that."
      >
        <input
          id={inputId}
          type="file"
          disabled={working}
          onChange={(e) => void onFile(e)}
          className={`${INPUT_CLASS} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-slate-100`}
        />
      </Field>

      <div aria-live="polite">
        {working ? <Spinner label={state.detail} /> : null}
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
              {state.source}
              {state.encrypted ? " (encrypted copy, decrypted in your browser)" : ""} · SHA-256 of the {state.encrypted ? "decrypted " : ""}contents{" "}
              <CopyChip value={state.hash} display={shorten(state.hash, 10, 8)} label="computed SHA-256" />
            </p>
            <p className="mt-2 text-xs text-slate-400">
              A match shows only that this file equals what was registered. It cannot show the evidence was genuine before registration.
            </p>
            {state.decrypted && state.matches ? (
              <Button className="mt-3 mr-2" size="sm" variant="secondary" icon={Download} onClick={() => downloadBytes(`evidence-${record.id}-decrypted.bin`, state.decrypted)}>
                Save the decrypted file
              </Button>
            ) : null}
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
export default function EvidenceActions({ record, ledger, account, paused, runWrite, keyClient = defaultKeyClient, gateways = lockerConfig.ipfsGateways }) {
  if (!record) return null;
  const isCustodian = sameAddress(record.custodian, account);

  return (
    <Panel title="Actions" titleId="actions-heading">
      <div className="space-y-4">
        <CheckFile key={record.id} record={record} ledger={ledger} paused={paused} runWrite={runWrite} keyClient={keyClient} gateways={gateways} />

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
