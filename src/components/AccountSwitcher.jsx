import { useState } from "react";
import { Repeat } from "lucide-react";
import { useWallet } from "../context/walletContext.js";

/**
 * The header's account switcher. Switching role disconnects this site from every wallet account first (see
 * `switchAccount`), so the next role has to be picked in the wallet's own account picker and sign in again; the page
 * offers no shortcut list of already-connected accounts.
 */
export default function AccountSwitcher({ buttonStyle, compact = false }) {
  const { switchAccount, isConnecting, isSigningIn } = useWallet();

  // MetaMask shows one request at a time: an unanswered sign-in message hides the account picker behind it, and the
  // page could only spin. Say so instead of queueing another request.
  const blockedBySignIn = isSigningIn && !isConnecting;
  const [triedWhileBlocked, setTriedWhileBlocked] = useState(false);
  const waitingHint = isConnecting
    ? "Waiting for MetaMask. If its window shows another request first (for example a sign-in message, \"1 of 2\"), answer that one; the account picker comes next."
    : blockedBySignIn && triedWhileBlocked
      ? "MetaMask is waiting for you to sign the sign-in message. Sign or reject it in MetaMask's window first, then switch account."
      : null;

  const onButton = () => {
    if (blockedBySignIn) {
      setTriedWhileBlocked(true);
      return;
    }
    setTriedWhileBlocked(false);
    void switchAccount();
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="dfl-focusable"
        onClick={onButton}
        disabled={isConnecting}
        aria-disabled={blockedBySignIn || undefined}
        style={buttonStyle}
        title="Sign out and disconnect this site from your wallet, then connect again as another account (role)"
      >
        <Repeat size={14} aria-hidden="true" />
        {compact ? <span className="sr-only">Switch account</span> : isConnecting ? "Waiting for MetaMask…" : "Switch account"}
      </button>
      {waitingHint ? (
        <p role="status" className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-amber-500/40 bg-slate-900 p-3 text-left text-xs text-amber-100 shadow-xl">
          {waitingHint}
        </p>
      ) : null}
    </div>
  );
}
