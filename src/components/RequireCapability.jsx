import { Link } from "react-router-dom";
import { Lock, Network, ServerCrash, ShieldAlert, WifiOff } from "lucide-react";
import { useRole } from "../context/roleContext.js";
import { useWallet } from "../context/walletContext.js";
import { ROLE_LABELS, rolesGranting } from "../web3/roles.js";
import { shorten } from "../web3/format.js";
import { Button, Spinner } from "./ui";

function Notice({ icon: Icon, title, children, action }) {
  return (
    <div role="region" aria-label={title} className="mx-auto mt-10 max-w-xl rounded-lg border border-slate-700 bg-slate-950/70 p-6 text-center">
      <Icon className="mx-auto size-10 text-sky-300" aria-hidden="true" />
      <h1 className="mt-3 text-xl font-bold text-slate-100">{title}</h1>
      <div className="mt-2 space-y-2 text-sm text-slate-300">{children}</div>
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * Explains why the user cannot proceed. Renders nothing for "ready" (the caller decides what ready means).
 * Every state other than ready is a denial: the roles are unknown, wrong, or absent.
 */
export function AccessState({ capability }) {
  const { status, role, error, refresh, switchNetwork, config } = useRole();
  const { account } = useWallet();

  switch (status) {
    case "loading":
      return (
        <div className="mt-10 flex justify-center">
          <Spinner label="Checking your role on the ledger…" />
        </div>
      );
    case "disconnected":
      return (
        <Notice icon={Lock} title="Connect your wallet">
          <p>Connect the wallet that holds your forensic role to continue.</p>
        </Notice>
      );
    case "wrong-network":
      return (
        <Notice
          icon={Network}
          title={`Switch to ${config.chainName}`}
          action={
            <Button variant="primary" onClick={() => void switchNetwork()}>
              Switch network
            </Button>
          }
        >
          <p>Your wallet is on a different network than the evidence ledger, so your role cannot be read.</p>
        </Notice>
      );
    case "unconfigured":
      return (
        <Notice icon={ServerCrash} title="Ledger not configured">
          <p>This build has no evidence contract configured, so access is denied to everyone.</p>
          <p className="text-slate-400">
            An administrator must set <code className="font-mono text-sky-200">VITE_LOCKER_ADDRESS</code> and rebuild.
          </p>
        </Notice>
      );
    case "misconfigured":
      return (
        <Notice icon={ServerCrash} title="Ledger misconfigured">
          <p>
            <code className="font-mono text-sky-200">VITE_LOCKER_ADDRESS</code> is not a valid address. Access is denied until it is fixed.
          </p>
        </Notice>
      );
    case "error":
      return (
        <Notice
          icon={WifiOff}
          title="Could not read your role"
          action={
            <Button variant="primary" onClick={() => void refresh()}>
              Try again
            </Button>
          }
        >
          <p>{error}</p>
          <p className="text-slate-400">Access stays denied until the role can be read.</p>
        </Notice>
      );
    default: {
      // status === "ready" but the capability is missing
      const needed = capability ? rolesGranting(capability) : [];
      return (
        <Notice icon={ShieldAlert} title="Not authorised">
          <p>
            {role === "none" ? (
              <>
                The wallet <span className="font-mono text-sky-200">{shorten(account ?? "", 6, 4)}</span> has no role on this ledger. Ask the Chief to authorise
                your address.
              </>
            ) : (
              <>
                Your role is <strong className="text-slate-100">{ROLE_LABELS[role]}</strong>, which cannot open this page.
              </>
            )}
          </p>
          {needed.length > 0 ? <p className="text-slate-400">Required: {needed.join(" or ")}.</p> : null}
          <p className="pt-2">
            <Link to="/cases" className="text-sky-300 underline underline-offset-2 hover:text-sky-200">
              Go to the case dashboard
            </Link>
          </p>
        </Notice>
      );
    }
  }
}

/**
 * Route guard. Shows `children` only when the wallet's role grants `capability`; otherwise explains why not.
 * This is a convenience for honest users, not a security control: the contract rejects unauthorised writes.
 */
export default function RequireCapability({ capability, children }) {
  const { status, can } = useRole();
  if (status === "ready" && can(capability)) return children;
  return <AccessState capability={capability} />;
}
