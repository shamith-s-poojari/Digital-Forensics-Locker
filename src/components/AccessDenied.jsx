import { useId, useState } from "react";
import { Clock3, Crown, RefreshCw, Send, ShieldX, Wallet, XCircle } from "lucide-react";
import { useAccessRequests } from "../access/accessRequestContext.js";
import { MAX_REASON_LENGTH } from "../access/accessRequestStores.js";
import { useAuth } from "../context/authContext.js";
import { useRole } from "../context/roleContext.js";
import { shorten } from "../web3/format.js";
import { friendlyMessage } from "../web3/ledgerErrors.js";
import { useLedger } from "../web3/ledgerContext.js";
import { ROLE_LABELS } from "../web3/roles.js";
import { Button, Field, INPUT_CLASS, Spinner } from "./ui";

const ROLE_CHOICES = [
  { value: "investigator", help: "Register evidence, log access and verification, transfer custody." },
  { value: "auditor", help: "Read-only: view the ledger and check files against it." },
  { value: "admin", help: "Manage Investigators and Auditors, approve access requests, pause the ledger. Only the Chief can approve this." },
];

function RequestForm({ previous, onSubmit }) {
  const roleId = useId();
  const reasonId = useId();
  const [role, setRole] = useState(previous?.role ?? "investigator");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ role, reason });
    } catch (err) {
      setError(err?.message ?? "Could not send the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3 text-left" aria-label="Request access">
      <Field label="Role you need" htmlFor={roleId} hint={ROLE_CHOICES.find((r) => r.value === role)?.help}>
        <select id={roleId} value={role} onChange={(e) => setRole(e.target.value)} className={INPUT_CLASS}>
          {ROLE_CHOICES.map((r) => (
            <option key={r.value} value={r.value}>
              {ROLE_LABELS[r.value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reason (optional)" htmlFor={reasonId} error={error}>
        <textarea
          id={reasonId}
          value={reason}
          maxLength={MAX_REASON_LENGTH}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example: assigned to the cybercrime unit, badge 4471"
          className={INPUT_CLASS}
        />
      </Field>
      <p className="text-xs text-slate-400">The reason is stored off chain and shown to the Chief. Do not include case details.</p>
      <Button type="submit" variant="primary" icon={Send} disabled={busy} className="w-full justify-center">
        {busy ? "Sending…" : "Request access"}
      </Button>
    </form>
  );
}

/** Development only: become the Chief of the demo ledger when nobody is. */
function ClaimChief() {
  const { ledger } = useLedger();
  const [error, setError] = useState("");
  if (!ledger?.isChiefUnclaimed?.()) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-amber-100">
      <p className="font-semibold">Development: nobody is the Chief yet</p>
      <p className="mt-1 text-amber-100/80">
        On a real contract the Chief is set at deployment. Here you can make this wallet the Chief, then grant roles or approve requests from
        other MetaMask accounts on the Role Management page. Lost when the page reloads; set <code>VITE_DEMO_ADMIN</code> in <code>.env</code> to keep it.
      </p>
      {error ? <p className="mt-1 text-rose-200">{error}</p> : null}
      <Button
        size="sm"
        variant="primary"
        icon={Crown}
        className="mt-2"
        onClick={() => ledger.claimChief().catch((err) => setError(friendlyMessage(err)))}
      >
        Make this wallet the Chief
      </Button>
    </div>
  );
}

/**
 * Shown instead of the app when the contract says the connected wallet holds no role. The wallet can ask the Chief
 * for a role here; access follows only once the Chief grants it on the ledger.
 */
export default function AccessDenied() {
  const { account, disconnect, isDemo } = useAuth();
  const { refresh } = useRole();
  const requests = useAccessRequests();
  const { mine } = requests;
  const [checking, setChecking] = useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try {
      await Promise.all([refresh(), requests.reload()]);
    } finally {
      setChecking(false);
    }
  };

  let body;
  if (requests.status === "loading") {
    body = <Spinner label="Checking for an access request…" />;
  } else if (requests.status === "unavailable") {
    body = <p className="text-sm text-slate-300">Ask the Chief to register your address as an Investigator or Auditor, then connect again.</p>;
  } else if (requests.status === "signed-out") {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-slate-300">Your wallet will ask you to sign a message first (free, not a transaction), to prove the request comes from this address.</p>
        <RequestForm onSubmit={requests.submit} />
      </div>
    );
  } else if (requests.status === "error") {
    body = (
      <p role="alert" className="text-sm text-rose-200">
        {requests.error}
      </p>
    );
  } else if (mine?.status === "pending") {
    body = (
      <div role="status" className="space-y-3">
        <p className="flex items-center justify-center gap-2 text-sm text-sky-100">
          <Clock3 className="size-4" aria-hidden="true" />
          Request sent for the <strong>{ROLE_LABELS[mine.role]}</strong> role. Waiting for the Chief to approve it.
        </p>
        <p className="text-xs text-slate-400">This page opens by itself once the role is granted on the ledger.</p>
        <Button size="sm" icon={RefreshCw} disabled={checking} onClick={() => void checkAgain()}>
          {checking ? "Checking…" : "Check again"}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        {mine?.status === "rejected" ? (
          <p className="flex items-center justify-center gap-2 text-sm text-rose-200">
            <XCircle className="size-4" aria-hidden="true" />
            Your request for the {ROLE_LABELS[mine.role]} role was rejected. You can send a new one.
          </p>
        ) : null}
        <RequestForm previous={mine} onSubmit={requests.submit} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
      <ShieldX className="size-12 text-rose-400" strokeWidth={1.5} aria-hidden="true" />
      <h1 className="text-2xl font-bold text-slate-100">Access Denied: Address not registered</h1>
      <p className="text-slate-300">
        The wallet <span className="font-mono text-sky-200">{shorten(account ?? "", 6, 4)}</span> holds no role on the evidence ledger.
      </p>
      <div className="w-full rounded-lg border border-slate-700 bg-slate-900/70 p-4">{body}</div>
      {isDemo ? <ClaimChief /> : null}
      <Button variant="ghost" icon={Wallet} onClick={disconnect}>
        Disconnect
      </Button>
    </div>
  );
}
