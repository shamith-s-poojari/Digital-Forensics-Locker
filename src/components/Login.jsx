import { ExternalLink, Fingerprint, LayoutDashboard, ShieldCheck, Wallet } from "lucide-react";
import { useAuth } from "../context/authContext.js";
import { Button } from "./ui";

/** What happens after "Connect", in order. Mirrors the gate in AuthContext.jsx. */
const STEPS = [
  {
    icon: Wallet,
    title: "Connect MetaMask",
    body: "Approve the connection, then sign a short message. Signing is free and is not a transaction.",
  },
  {
    icon: ShieldCheck,
    title: "Your role is read from the contract",
    body: "Chief, Admin, Investigator or Auditor, exactly as the evidence ledger records it. You cannot pick it here.",
  },
  {
    icon: LayoutDashboard,
    title: "Open your workspace",
    body: "A registered wallet goes straight to its dashboard. A wallet with no role can ask the Chief for one.",
  },
];

/** True when the browser has an injected EIP-1193 wallet such as MetaMask. */
function hasInjectedWallet() {
  return typeof window !== "undefined" && typeof window.ethereum?.request === "function";
}

/**
 * The gateway shown while no wallet is connected (gate "signed-out"). Connecting only proves which address this is;
 * the role is then read from the contract by RoleProvider, and Layout moves on to the app or to the access request
 * screen. Nothing here lets the user choose a role.
 *
 * Must be inside <AuthProvider>.
 */
export default function Login() {
  const { connect, isConnecting, error, notice } = useAuth();
  const walletFound = hasInjectedWallet();

  return (
    <div className="mx-auto grid w-full max-w-4xl items-center gap-8 md:grid-cols-[1.1fr_1fr] md:gap-12">
      <section className="text-left">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
          <Fingerprint className="size-4" aria-hidden="true" />
          Chain of custody
        </p>
        <h1 className="text-3xl font-bold leading-tight text-slate-50 md:text-4xl">Sign in to the evidence ledger</h1>
        <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-300">
          Connect your MetaMask wallet to continue. Connecting a wallet is not authorization: what you may see and do is
          decided by the roles your wallet holds on the ledger.
        </p>

        <div className="mt-6 space-y-3">
          {notice && !error ? (
            <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            icon={Wallet}
            loading={isConnecting}
            onClick={connect}
            className="w-full justify-center sm:w-auto"
          >
            {isConnecting ? "Waiting for MetaMask…" : "Connect MetaMask"}
          </Button>

          {walletFound ? (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
              Browser wallet detected
            </p>
          ) : (
            <p className="text-sm text-slate-300">
              No browser wallet found.{" "}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-300 underline underline-offset-2 hover:text-sky-200"
              >
                Install MetaMask
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
              , then reload this page.
            </p>
          )}
        </div>
      </section>

      <ol className="space-y-3" aria-label="How sign-in works">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="flex gap-4 rounded-lg border border-slate-700 bg-slate-900/70 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-300">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-100">
                <span className="mr-2 font-mono text-xs text-slate-500">0{index + 1}</span>
                {title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
