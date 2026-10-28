import { useId, useState } from "react";
import { isAddress } from "ethers";
import { Check, Crown, PauseCircle, PlayCircle, ShieldPlus, UserMinus, X } from "lucide-react";
import { useAccessRequests } from "../access/accessRequestContext.js";
import Can from "../components/Can";
import WriteActivity from "../components/WriteActivity";
import { Badge, Button, CopyChip, Field, INPUT_CLASS, Panel, Spinner } from "../components/ui";
import { useRole } from "../context/roleContext.js";
import { useWallet } from "../context/walletContext.js";
import { sameAddress } from "../web3/format.js";
import { useLedger } from "../web3/ledgerContext.js";
import { CAPABILITIES, ROLE_LABELS } from "../web3/roles.js";
import { useLedgerQuery } from "../web3/useLedgerQuery.js";
import { useWriteFlow } from "../web3/useWriteFlow.js";

const loadAdminData = async (ledger) => {
  const [members, paused] = await Promise.all([ledger.listRoleMembers(), ledger.isPaused()]);
  return { members, paused };
};

const ROLE_OPTIONS = [
  { value: "investigator", label: "Investigator", help: "Can register evidence, log access and verification, and transfer custody." },
  { value: "auditor", label: "Auditor", help: "Read-only: can view the ledger and check files against it. Cannot write." },
  {
    value: "admin",
    label: "Admin",
    help: "Can grant and revoke Investigators and Auditors, approve access requests and pause the ledger. Cannot appoint Admins or write evidence.",
    chiefOnly: true,
  },
];

const MEMBER_LIST = { admin: "admins", investigator: "investigators", auditor: "auditors" };
const holdersOf = (members, role) => members[MEMBER_LIST[role]] ?? [];

/**
 * Pending access requests. Approving grants the role on the ledger (a transaction the contract checks) and only then
 * marks the request approved; rejecting just records the decision. Only the Chief can approve an Admin request.
 */
function RequestsPanel({ members, busy, runWrite, ledger, canManageAdmins }) {
  const requests = useAccessRequests();
  const [error, setError] = useState("");
  if (requests.status === "unavailable") return null;

  const holds = (r) => holdersOf(members, r.role).some((a) => sameAddress(a, r.address));

  async function approve(r) {
    setError("");
    try {
      if (!holds(r)) {
        const outcome = await runWrite(`Grant ${ROLE_LABELS[r.role]} role`, () => ledger.grantRole(r.role, r.address));
        if (!outcome.ok) return;
      }
      await requests.resolve(r.id, "approved");
    } catch (err) {
      setError(err?.message ?? "Could not update the request.");
    }
  }

  async function reject(r) {
    setError("");
    try {
      await requests.resolve(r.id, "rejected");
    } catch (err) {
      setError(err?.message ?? "Could not update the request.");
    }
  }

  return (
    <Panel title={`Access requests (${requests.pending.length})`} titleId="requests-heading" bodyClassName="p-0">
      {error ? (
        <p role="alert" className="border-b border-slate-800 px-4 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {requests.status === "loading" ? (
        <div className="p-4">
          <Spinner label="Reading access requests…" />
        </div>
      ) : requests.status === "error" || requests.status === "signed-out" ? (
        <p className="px-4 py-4 text-sm text-slate-300">{requests.status === "signed-out" ? "Sign in to see access requests." : requests.error}</p>
      ) : requests.pending.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">No pending requests.</p>
      ) : (
        <ul>
          {requests.pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CopyChip value={r.address} label="Requesting address" />
                  <Badge tone="info">{ROLE_LABELS[r.role]}</Badge>
                </div>
                {r.reason ? <p className="text-sm text-slate-300">{r.reason}</p> : null}
                <p className="text-xs text-slate-500">Requested {new Date(r.createdAt).toLocaleString()}</p>
              </div>
              {r.role === "admin" && !canManageAdmins ? (
                <span className="text-xs text-slate-400">Only the Chief can approve Admins</span>
              ) : (
                <Button size="sm" variant="primary" icon={Check} disabled={busy} onClick={() => void approve(r)} aria-label={`Approve ${ROLE_LABELS[r.role]} for ${r.address}`}>
                  Approve
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={X} disabled={busy} onClick={() => void reject(r)} aria-label={`Reject request from ${r.address}`}>
                Reject
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MemberRow({ address, role, isYou, disabled, canRevoke = true, onRevoke }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2 last:border-b-0">
      <CopyChip value={address} label={`${role} address`} className="min-w-0 flex-1" />
      {isYou ? <Badge tone="info">you</Badge> : null}
      {!canRevoke ? null : confirming ? (
        <span className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="danger"
            disabled={disabled}
            onClick={() => {
              setConfirming(false);
              onRevoke();
            }}
          >
            Confirm revoke
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" icon={UserMinus} disabled={disabled} onClick={() => setConfirming(true)} aria-label={`Revoke ${role} role from ${address}`}>
          Revoke
        </Button>
      )}
    </li>
  );
}

/**
 * Role Management (Chief and Admins). Assigns or revokes the Investigator and Auditor roles on the contract, decides
 * access requests, and can pause or resume all evidence writes. Only the Chief appoints or removes Admins.
 *
 * By design neither the Chief nor an Admin can register evidence unless also given the Investigator role.
 */
export default function AdminRoles() {
  const { ledger, config } = useLedger();
  const { account } = useWallet();
  const canManageAdmins = useRole().can(CAPABILITIES.MANAGE_ADMINS);
  const roleOptions = ROLE_OPTIONS.filter((r) => !r.chiefOnly || canManageAdmins);
  const { status, data, error, reload } = useLedgerQuery(loadAdminData);
  const write = useWriteFlow({ config, onConfirmed: reload });

  const addressId = useId();
  const roleId = useId();
  const [address, setAddress] = useState("");
  const [role, setRole] = useState("investigator");
  const [formError, setFormError] = useState("");

  const members = data?.members;
  const paused = data?.paused ?? false;
  const roleInfo = ROLE_OPTIONS.find((r) => r.value === role);

  async function onGrant(event) {
    event.preventDefault();
    const trimmed = address.trim();
    if (!isAddress(trimmed)) {
      setFormError("Enter a valid wallet address (0x followed by 40 hex characters).");
      return;
    }
    if (holdersOf(members, role).some((a) => sameAddress(a, trimmed))) {
      setFormError(`That address is already an ${roleInfo.label}.`);
      return;
    }
    setFormError("");
    const outcome = await write.runWrite(`Grant ${roleInfo.label} role`, () => ledger.grantRole(role, trimmed));
    if (outcome.ok) setAddress("");
  }

  const busy = write.isRunning;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-50">Role Management</h1>
        <p className="text-sm text-slate-300">Decide which wallet addresses may work with evidence. Changes are transactions on the ledger and take effect once confirmed.</p>
      </div>

      {status === "loading" || status === "idle" ? <Spinner label="Reading roles from the ledger…" /> : null}

      {status === "error" ? (
        <div role="alert" className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}{" "}
          <Button size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : null}

      {status === "ready" ? (
        <>
          <Panel title="Chief" titleId="chief-heading" bodyClassName="flex flex-wrap items-center gap-2 p-4">
            <Crown className="size-4 text-amber-300" aria-hidden="true" />
            <CopyChip value={members.chief} label="Chief address" />
            {sameAddress(members.chief, account) ? <Badge tone="info">you</Badge> : null}
            <p className="basis-full text-xs text-slate-400">
              The Chief role moves only through the contract&apos;s two-step transfer with a waiting period. It cannot be granted from this page.
            </p>
          </Panel>

          <RequestsPanel members={members} busy={busy} runWrite={write.runWrite} ledger={ledger} canManageAdmins={canManageAdmins} />

          <Panel title="Authorise an address" titleId="grant-heading">
            <form onSubmit={(e) => void onGrant(e)} noValidate className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
              <Field label="Wallet address" htmlFor={addressId} error={formError}>
                <input
                  id={addressId}
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setFormError("");
                  }}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={formError ? "true" : undefined}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </Field>
              <Field label="Role" htmlFor={roleId}>
                <select id={roleId} value={role} onChange={(e) => setRole(e.target.value)} className={INPUT_CLASS}>
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" variant="primary" icon={ShieldPlus} disabled={busy || !address.trim()}>
                Grant role
              </Button>
              <p className="text-xs text-slate-400 sm:col-span-3">{roleInfo.help}</p>
            </form>
          </Panel>

          {[
            { key: "admin", title: "Admins", list: members.admins, canRevoke: canManageAdmins },
            { key: "investigator", title: "Investigators", list: members.investigators, canRevoke: true },
            { key: "auditor", title: "Auditors", list: members.auditors, canRevoke: true },
          ].map(({ key, title, list, canRevoke }) => (
            <Panel key={key} title={`${title} (${list.length})`} titleId={`${key}-heading`} bodyClassName="p-0">
              {list.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No addresses hold this role.</p>
              ) : (
                <ul>
                  {list.map((a) => (
                    <MemberRow
                      key={a}
                      address={a}
                      role={key}
                      isYou={sameAddress(a, account)}
                      disabled={busy}
                      canRevoke={canRevoke}
                      onRevoke={() => void write.runWrite(`Revoke ${key} role`, () => ledger.revokeRole(key, a))}
                    />
                  ))}
                </ul>
              )}
            </Panel>
          ))}

          <Can capability={CAPABILITIES.PAUSE}>
            <Panel title="Emergency stop" titleId="pause-heading" bodyClassName="flex flex-wrap items-center gap-3 p-4">
              <p className="min-w-0 flex-1 text-sm text-slate-300">
                {paused
                  ? "Evidence writes are paused for everyone. Reading and verifying still work."
                  : "Pausing stops all evidence registration and custody logging, for example after a suspected key compromise."}
              </p>
              <Button
                variant={paused ? "primary" : "danger"}
                icon={paused ? PlayCircle : PauseCircle}
                disabled={busy}
                onClick={() => void write.runWrite(paused ? "Resume the ledger" : "Pause the ledger", () => (paused ? ledger.unpause() : ledger.pause()))}
              >
                {paused ? "Resume ledger" : "Pause ledger"}
              </Button>
            </Panel>
          </Can>
        </>
      ) : null}

      <WriteActivity title={write.title} steps={write.steps} isIdle={write.isIdle} isRunning={write.isRunning} onDismiss={write.dismiss} />
    </div>
  );
}
