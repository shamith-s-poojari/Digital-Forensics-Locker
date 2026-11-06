import { ArrowRightLeft, BadgeCheck, ExternalLink, FileLock2, Fingerprint, LayoutDashboard, ShieldCheck, Wallet } from "lucide-react";
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

/** The three custody events the hero visual walks through. Sample hashes, for decoration only. */
const CHAIN = [
  { icon: FileLock2, label: "Collected", hash: "9f86…0a08" },
  { icon: ArrowRightLeft, label: "Transferred", hash: "3c2e…b71d" },
  { icon: BadgeCheck, label: "Verified", hash: "9f86…0a08" },
];

/**
 * Decorative custody chain: a light pulse runs along the links and each block lights up as it arrives,
 * ending on a green "verified" block whose hash matches the first. CSS only (see .custody-chain in index.css).
 */
function CustodyChain() {
  return (
    <div aria-hidden="true" className="glass custody-chain animate-rise rounded-xl p-4">
      <div className="mb-4 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-400">Evidence #A-1027</span>
        <span className="flex items-center gap-1.5 font-medium text-emerald-300">
          <span className="live-dot size-1.5 rounded-full bg-emerald-400" />
          Hash match
        </span>
      </div>
      <div className="chain-row">
        {CHAIN.map(({ icon: Icon, label, hash }, i) => (
          <div key={label} className="contents">
            {i > 0 ? <span className={`chain-link chain-link-${i}`} /> : null}
            <div className={`chain-node chain-node-${i + 1}`}>
              <span className="chain-node-icon">
                <Icon className="size-[18px]" />
              </span>
              <span className="text-xs font-medium text-slate-200">{label}</span>
              <span className="font-mono text-[10px] text-slate-500">{hash}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
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

      <div className="space-y-3">
      <CustodyChain />
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
