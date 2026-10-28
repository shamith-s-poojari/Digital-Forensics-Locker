import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, FileUp, FolderOpen, Info, PauseCircle, RotateCcw, ShieldCheck, X } from "lucide-react";
import TxProgress from "../components/TxProgress";
import { Badge, Button, CopyChip, Field, INPUT_CLASS, Panel } from "../components/ui";
import { computeCaseDigest } from "../cases/caseDigest.js";
import { useCaseDirectory } from "../cases/caseDirectoryContext.js";
import { useWallet } from "../context/walletContext.js";
import { encryptEvidence } from "../crypto/evidenceCrypto.js";
import { keyClient as defaultKeyClient } from "../crypto/keyClient.js";
import { computeSHA256, formatFileSize, MAX_HASH_BYTES } from "../utils/hash";
import { uploadToIPFSWithProgress } from "../utils/ipfs";
import { txUrl } from "../web3/config.js";
import { deriveCaseRef, shorten } from "../web3/format.js";
import { useLedger } from "../web3/ledgerContext.js";
import { friendlyMessage } from "../web3/ledgerErrors.js";
import { useWriteFlow } from "../web3/useWriteFlow.js";

// Module-level so the list is stable across renders.
const UPLOAD_STEPS = [
  { key: "hash", label: "Compute SHA-256 in your browser" },
  { key: "case", label: "Prepare the case-details digest" },
  { key: "encrypt", label: "Encrypt in your browser and store the key" },
  { key: "pin", label: "Pin the encrypted copy to IPFS" },
  { key: "sign", label: "Approve in your wallet" },
  { key: "confirm", label: "Confirm on the ledger" },
];

/**
 * Evidence Upload Interface (Investigators only; the route is guarded and the contract enforces it).
 *
 * One action, six visible stages, each reporting what it is waiting on:
 *   1. hash      SHA-256 of the ORIGINAL file, computed locally (this is what the ledger records and verifies)
 *   2. case      the case's off-chain details (created as version 1 for a new case) and the digest of their current
 *                version, which the record anchors on chain (src/cases/caseDigest.js)
 *   3. encrypt   AES-256-GCM with a fresh random key, in the browser; the key goes to the key store (server/keyStore.js)
 *   4. pin       upload of the ENCRYPTED copy to IPFS through the server-side proxy, with real byte progress
 *   5. sign      the wallet's signature prompt
 *   6. confirm   the transaction waiting for a block, with an explorer link
 * Plaintext never leaves the browser, and nothing is pinned unless its key was stored first. If a later stage fails,
 * earlier results are kept: the same encrypted copy (and key) is reused, and a pinned copy is not pinned again.
 *
 * @param {object} props
 * @param {typeof defaultKeyClient} [props.keyClient] Override for tests.
 */
export default function EvidenceUpload({ keyClient = defaultKeyClient }) {
  const { ledger, config } = useLedger();
  const { ensureSession } = useWallet();
  const directory = useCaseDirectory();
  const caseId = useId();
  const caseTitleId = useId();
  const caseDescriptionId = useId();
  const [caseTitle, setCaseTitle] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const fileId = useId();

  const [caseNumber, setCaseNumber] = useState("");
  const [file, setFile] = useState(null);
  const [hashState, setHashState] = useState({ status: "idle", hash: "", error: "" });
  const [encrypted, setEncrypted] = useState(null); // { hash, keyId, envelope } once the key is stored
  const [pinned, setPinned] = useState(null); // { hash, cid, keyId } for the file that has been pinned
  const [duplicateId, setDuplicateId] = useState(null);
  const [caseError, setCaseError] = useState("");
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const hashRequest = useRef(0);

  const write = useWriteFlow({ config, steps: UPLOAD_STEPS });
  const { flow, runWrite } = write;

  useEffect(() => {
    let cancelled = false;
    ledger
      .isPaused()
      .then((value) => !cancelled && setPaused(value))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ledger, result]);

  const chooseFile = useCallback(
    async (chosen) => {
      const request = ++hashRequest.current;
      flow.reset();
      setResult(null);
      setEncrypted(null);
      setPinned(null);
      setDuplicateId(null);
      setFile(chosen);

      if (chosen.size > MAX_HASH_BYTES) {
        setHashState({ status: "error", hash: "", error: `This file is ${formatFileSize(chosen.size)}. In-browser hashing is limited to ${formatFileSize(MAX_HASH_BYTES)}.` });
        return;
      }

      setHashState({ status: "hashing", hash: "", error: "" });
      flow.start("hash", `Hashing ${chosen.name}…`);
      try {
        const hash = await computeSHA256(chosen);
        if (request !== hashRequest.current) return; // a newer file was chosen meanwhile
        setHashState({ status: "ready", hash, error: "" });
        flow.done("hash", `SHA-256 ${shorten(hash, 10, 8)}`);
      } catch (err) {
        if (request !== hashRequest.current) return;
        setHashState({ status: "error", hash: "", error: err?.message ?? "Could not hash this file." });
        flow.fail("hash", err?.message ?? "Could not hash this file.");
      }
    },
    [flow]
  );

  function clearFile() {
    hashRequest.current += 1;
    flow.reset();
    setFile(null);
    setHashState({ status: "idle", hash: "", error: "" });
    setEncrypted(null);
    setPinned(null);
    setDuplicateId(null);
  }

  function startOver() {
    clearFile();
    setCaseNumber("");
    setCaseTitle("");
    setCaseDescription("");
    setResult(null);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setCaseError("");
    setDuplicateId(null);
    if (!caseNumber.trim()) {
      setCaseError("Enter the case number this evidence belongs to.");
      return;
    }
    if (directory.status !== "ready") {
      setCaseError(directory.error ?? "The case store is not available, so the case details cannot be anchored. Try again in a moment.");
      return;
    }
    if (isNewCase && !caseTitle.trim()) {
      setCaseError("This is a new case: give it a title. It is kept off chain; only a salted digest is anchored.");
      return;
    }
    if (hashState.status !== "ready" || !file) return;

    const { hash } = hashState;
    const caseRef = deriveCaseRef(caseNumber);
    setSubmitting(true);
    let stage = "case";
    try {
      // Cheap read first: do not upload a file that the ledger will refuse as a duplicate.
      const existing = await ledger.findEvidence(caseRef, hash);
      if (existing) {
        setDuplicateId(existing);
        return;
      }

      // The record anchors the digest of the case's CURRENT details, recomputed here from the fields.
      flow.start("case", knownCase ? "Reading the case details…" : "Creating the case details (version 1)…");
      const entry = knownCase ?? (await directory.create({ caseNumber, title: caseTitle, description: caseDescription }));
      const current = entry.versions.at(-1);
      const caseDigest = computeCaseDigest({ caseRef: entry.caseRef, caseNumber: entry.caseNumber, title: current.title, description: current.description, salt: current.salt });
      flow.done("case", `Case details v${current.version} · digest ${shorten(caseDigest, 8, 6)}`);

      stage = "encrypt";
      let cid = pinned?.hash === hash ? pinned.cid : null;
      let keyId = pinned?.hash === hash ? pinned.keyId : null;
      if (cid) {
        flow.done("encrypt", `Already encrypted earlier (key ${shorten(keyId, 8, 6)})`);
        flow.done("pin", `Already pinned earlier: ${shorten(cid, 12, 8)}`);
      } else {
        // The key and pin servers only accept signed-in callers, and a switched or locked wallet must not act under the old identity.
        flow.start("encrypt", "Checking your sign-in…");
        const auth = await ensureSession();
        if (!auth.ok) {
          flow.fail("encrypt", auth.error);
          return;
        }

        let sealed = encrypted?.hash === hash ? encrypted : null;
        if (sealed) {
          flow.done("encrypt", `Already encrypted earlier (key ${shorten(sealed.keyId, 8, 6)})`);
        } else {
          flow.start("encrypt", "Encrypting with a new AES-256-GCM key…");
          const { envelope, keyId: newKeyId, key } = await encryptEvidence(file, hash);
          flow.detail("encrypt", "Storing the decryption key on the key server…");
          await keyClient.storeKey({ keyId: newKeyId, sha256: hash, key });
          sealed = { hash, keyId: newKeyId, envelope };
          setEncrypted(sealed);
          flow.done("encrypt", `Encrypted; key ${shorten(newKeyId, 8, 6)} stored`);
        }
        keyId = sealed.keyId;

        stage = "pin";
        flow.start("pin", "Uploading the encrypted copy to IPFS…");
        flow.progress("pin", 0);
        // A neutral name and type: the original file name would otherwise be stored in Pinata's public metadata.
        const upload = new File([sealed.envelope], `${keyId}.dfl`, { type: "application/octet-stream" });
        cid = await uploadToIPFSWithProgress(upload, {
          onProgress: (percent) => flow.progress("pin", percent, percent >= 100 ? "Sent. Waiting for Pinata to confirm the pin…" : `Uploading… ${percent}%`),
        });
        setPinned({ hash, cid, keyId });
        flow.done("pin", `Pinned as ${shorten(cid, 12, 8)}`);
      }

      stage = "write";
      const outcome = await runWrite("Register evidence", () => ledger.registerEvidence({ caseRef, sha256: hash, cid, caseDigest }), { keepSteps: true });
      if (outcome.ok) setResult({ evidenceId: outcome.mined.evidenceId, txHash: outcome.mined.hash, blockNumber: outcome.mined.blockNumber, cid, hash, keyId });
    } catch (err) {
      // Only the duplicate check, the encryption, the key store and the pin can throw here; wallet and chain errors are
      // handled inside runWrite.
      if (stage === "case" || stage === "encrypt" || stage === "pin") flow.fail(stage, err?.message ?? friendlyMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void chooseFile(dropped);
  }

  let typedCaseRef = null;
  try {
    typedCaseRef = caseNumber.trim() ? deriveCaseRef(caseNumber) : null;
  } catch {
    /* not a usable case number yet */
  }
  const knownCase = typedCaseRef ? directory.byRef.get(typedCaseRef) ?? null : null;
  const isNewCase = Boolean(typedCaseRef) && directory.status === "ready" && !knownCase;

  const canSubmit = hashState.status === "ready" && !paused && !submitting && !result;
  const explorerHref = result ? txUrl(config, result.txHash) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-50">Register Evidence</h1>
        <p className="text-sm text-slate-300">Hash the file, encrypt it, pin the encrypted copy to IPFS, then record it on the ledger. Each stage is shown as it happens.</p>
      </div>

      {paused ? (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <PauseCircle className="size-4 shrink-0" aria-hidden="true" />
          The Chief has paused the ledger. Evidence cannot be registered until it is resumed.
        </div>
      ) : null}

      <div role="note" className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          The file is <strong>encrypted in your browser</strong> before it is pinned; only the encrypted copy goes to the <strong>public</strong> IPFS network, where it
          stays permanently. Its decryption key is kept by the key server, not on IPFS or the ledger. Development build: the server's master key is an environment variable,
          and any signed-in wallet can request a key. Do not register real evidence yet.
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
          <Panel title="1 · Case and file" titleId="upload-form-heading" bodyClassName="space-y-4 p-4">
            <Field label="Case number" htmlFor={caseId} hint="Stored on the ledger only as an opaque reference, never as text." error={caseError}>
              <input
                id={caseId}
                value={caseNumber}
                onChange={(e) => {
                  setCaseNumber(e.target.value);
                  setCaseError("");
                  setDuplicateId(null);
                }}
                placeholder="CASE-2025-0042"
                autoComplete="off"
                disabled={submitting || Boolean(result)}
                aria-invalid={caseError ? "true" : undefined}
                className={INPUT_CLASS}
              />
            </Field>

            {knownCase ? (
              <p className="text-xs text-slate-300">
                Case found: <span className="font-semibold text-slate-100">{knownCase.versions.at(-1).title}</span> (details v{knownCase.versions.at(-1).version}, anchored with this record).
              </p>
            ) : null}
            {isNewCase ? (
              <div className="space-y-3 rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
                <p className="text-xs text-sky-100">New case. Its title and description stay off chain; a salted digest of them is anchored with this record.</p>
                <Field label="Case title" htmlFor={caseTitleId}>
                  <input id={caseTitleId} value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} maxLength={200} autoComplete="off" disabled={submitting || Boolean(result)} className={INPUT_CLASS} />
                </Field>
                <Field label="Case description" htmlFor={caseDescriptionId}>
                  <textarea id={caseDescriptionId} value={caseDescription} onChange={(e) => setCaseDescription(e.target.value)} maxLength={4000} disabled={submitting || Boolean(result)} className={`${INPUT_CLASS} min-h-16`} />
                </Field>
              </div>
            ) : null}
            {directory.status === "signed-out" || directory.status === "error" ? (
              <p className="text-xs text-amber-200">{directory.status === "signed-out" ? "Sign in with your wallet to look up the case details." : directory.error}</p>
            ) : null}

            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">Evidence file</span>
              <input
                id={fileId}
                type="file"
                className="peer sr-only"
                disabled={submitting || Boolean(result)}
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  e.target.value = "";
                  if (chosen) void chooseFile(chosen);
                }}
              />
              <label
                htmlFor={fileId}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${
                  isDragging ? "border-sky-400 bg-sky-500/10" : "border-slate-600 bg-slate-900/60 hover:border-slate-400"
                }`}
              >
                <FileUp className="size-8 text-sky-300" aria-hidden="true" />
                <span className="text-sm font-semibold text-slate-100">{isDragging ? "Drop to hash this file" : "Choose a file or drag it here"}</span>
                <span className="text-xs text-slate-400">Up to {formatFileSize(MAX_HASH_BYTES)}. Hashing and encryption happen in your browser; the original file is never sent.</span>
              </label>
            </div>

            {file ? (
              <div className="flex items-start gap-3 rounded-md border border-slate-700 bg-slate-900/70 p-3">
                <FolderOpen className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                  <p className="break-all font-medium text-slate-100">
                    {file.name} <span className="font-normal text-slate-400">· {formatFileSize(file.size)}</span>
                  </p>
                  {hashState.status === "ready" ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                      SHA-256 <CopyChip value={hashState.hash} display={shorten(hashState.hash, 12, 10)} label="SHA-256" />
                    </p>
                  ) : null}
                  {pinned?.hash === hashState.hash && pinned ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                      IPFS CID <CopyChip value={pinned.cid} display={shorten(pinned.cid, 12, 8)} label="IPFS CID" textClassName="text-sky-200" />
                    </p>
                  ) : null}
                  {hashState.status === "error" ? (
                    <p role="alert" className="flex items-center gap-1.5 text-xs text-rose-300">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {hashState.error}
                    </p>
                  ) : null}
                </div>
                {!submitting && !result ? (
                  <button type="button" onClick={clearFile} aria-label={`Remove ${file.name}`} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </Panel>

          {duplicateId ? (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                This exact file is already registered for this case as evidence <strong>#{duplicateId}</strong>. Nothing was uploaded.{" "}
                <Link to="/cases" className="underline underline-offset-2">
                  Open the case dashboard
                </Link>
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="lg" loading={submitting} disabled={!canSubmit} icon={ShieldCheck}>
              {submitting ? "Working…" : "Encrypt, pin and register"}
            </Button>
            {hashState.status === "idle" ? <span className="text-xs text-slate-400">Choose a file to continue.</span> : null}
            {hashState.status === "hashing" ? <span className="text-xs text-slate-400">Waiting for the hash…</span> : null}
          </div>
        </form>

        <div className="space-y-4">
          <TxProgress steps={write.steps} title="Progress" />

          {result ? (
            <Panel title="Registered" titleId="upload-result-heading">
              <div className="space-y-2 text-sm" role="status">
                <Badge tone="success" icon={ShieldCheck}>
                  Evidence #{result.evidenceId} recorded
                </Badge>
                <p className="text-slate-300">Block {result.blockNumber}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                  CID <CopyChip value={result.cid} display={shorten(result.cid, 12, 8)} label="IPFS CID" textClassName="text-sky-200" />
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                  Key id <CopyChip value={result.keyId} display={shorten(result.keyId, 8, 6)} label="decryption key id" />
                </p>
                {explorerHref ? (
                  <a href={explorerHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 underline underline-offset-2">
                    View the transaction <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    to="/cases"
                    className="inline-flex items-center rounded-md border border-sky-400 bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 no-underline hover:bg-sky-400"
                  >
                    View in the dashboard
                  </Link>
                  <Button size="sm" icon={RotateCcw} onClick={startOver}>
                    Register another
                  </Button>
                </div>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
