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
    body: "Chief, Branch Admin, Investigator or Auditor, and your branch, exactly as the evidence ledger records them. You cannot pick them here.",
  },
  {
    icon: LayoutDashboard,
    title: "Open your workspace",
    body: "A registered wallet goes straight to its dashboard. A wallet with no role can ask its branch for one.",
  },
];

/** What the ledger is built on, shown in the scrolling strip under the hero. */
const STACK = ["SHA-256 in the browser", "Ethereum Sepolia", "IPFS / Pinata", "Sign-In with Ethereum", "On-chain roles", "AES-GCM encryption", "Custody PDF reports"];

/** Four-point star used as the floating sparkles in the hero (decorative). */
function Sparkle({ size, className = "", style }) {
  return (
    <span aria-hidden="true" className={`sparkle pointer-events-none absolute ${className}`} style={style}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id={`sparkle-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#8a8a8a" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </linearGradient>
        </defs>
        <path
          d="M50 0 C54 30 70 46 100 50 C70 54 54 70 50 100 C46 70 30 54 0 50 C30 46 46 30 50 0 Z"
          style={{ fill: "var(--color-slate-950)" }}
          stroke={`url(#sparkle-${size})`}
          strokeWidth="2.5"
        />
      </svg>
    </span>
  );
}

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
    <div className="mx-auto w-full max-w-5xl">
    <div className="grid w-full items-center gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
      <section className="relative text-left">
        <Sparkle size={110} className="-top-20 right-0 hidden md:block" />
        <Sparkle size={44} className="top-6 right-28 hidden md:block" style={{ animationDelay: "-2.5s" }} />
        <Sparkle size={30} className="top-40 -right-4 hidden md:block" style={{ animationDelay: "-4s" }} />

        <p className="eyebrow animate-rise">
          <span className="eyebrow-tag">Live</span>
          <Fingerprint className="size-3.5" aria-hidden="true" />
          Chain of custody on Ethereum
        </p>
        <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          <span className="text-metal block animate-rise" style={{ animationDelay: "80ms" }}>Sign in to the</span>{" "}
          <span className="text-metal-soft block animate-rise" style={{ animationDelay: "160ms" }}>evidence ledger</span>
        </h1>
        <p className="mt-5 max-w-prose text-base leading-relaxed text-slate-400 animate-rise" style={{ animationDelay: "240ms" }}>
          Connect your MetaMask wallet to continue. Connecting a wallet is not authorization: what you may see and do is
          decided by the roles your wallet holds on the ledger.
        </p>

        <div className="mt-7 space-y-3 animate-rise" style={{ animationDelay: "320ms" }}>
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
              <span className="live-dot size-2 rounded-full bg-emerald-400" aria-hidden="true" />
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

      <ol className="stagger space-y-3" aria-label="How sign-in works">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="glass glass-hover flex gap-4 rounded-xl p-4">
            <span className="glass flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-100">
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

      {/* Decorative: the same items twice so the strip can loop seamlessly. */}
      <div className="marquee mt-14 animate-fade" style={{ animationDelay: "500ms" }} aria-hidden="true">
        <div className="marquee-track">
          {[...STACK, ...STACK].map((item, i) => (
            <span key={i} className="mx-6 whitespace-nowrap text-sm font-medium text-slate-500">
              <span className="mr-6 text-slate-700">✦</span>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
