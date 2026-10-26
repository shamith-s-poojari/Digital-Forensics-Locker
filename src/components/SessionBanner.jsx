import { KeyRound, ShieldCheck, X } from "lucide-react";
import { useWallet } from "../context/walletContext.js";
import { Button } from "./ui";

/**
 * Sign-in status under the top bar: why a session ended (wallet locked, account switched, expired) and a way to sign
 * in again. Shown only while a wallet is connected; the signed-out wallet screen shows its own messages.
 */
export default function SessionBanner() {
  const { account, isSignedIn, isSigningIn, signIn, error, clearError, notice, clearNotice } = useWallet();
  if (!account || isSignedIn) return null;

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
      <KeyRound className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {notice ?? "Not signed in. Viewing works; evidence actions will ask you to sign a message first (free, not a transaction)."}
        {error ? <span className="mt-1 block text-rose-200">{error}</span> : null}
      </span>
      <Button
        size="sm"
        variant="primary"
        icon={ShieldCheck}
        disabled={isSigningIn}
        onClick={() => {
          clearError();
          void signIn();
        }}
      >
        {isSigningIn ? "Check your wallet…" : "Sign in"}
      </Button>
      {notice ? (
        <button type="button" onClick={clearNotice} className="rounded p-1 text-amber-200 hover:text-amber-50" aria-label="Dismiss message">
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
