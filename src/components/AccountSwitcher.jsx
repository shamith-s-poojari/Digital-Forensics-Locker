import { useEffect, useId, useRef, useState } from "react";
import { Check, Plus, Repeat } from "lucide-react";
import { useWallet } from "../context/walletContext.js";
import { accountName } from "../web3/accountNames.js";
import { sameAddress, shorten } from "../web3/format.js";
import { useLedger } from "../web3/ledgerContext.js";
import { ROLE_LABELS, primaryRole } from "../web3/roles.js";

/** Role and branch of each address, read from the ledger, for labelling the choices. */
async function describeAccounts(ledger, addresses) {
  const branches = Object.fromEntries(((await ledger.listBranches?.()) ?? []).map((b) => [b.id, b.name]));
  const rows = await Promise.all(
    addresses.map(async (address) => {
      const [flags, identity] = await Promise.all([ledger.getRoles(address), ledger.getIdentity?.(address)]);
      const role = primaryRole(flags);
      const branch = identity?.branchId ? branches[identity.branchId] ?? `Branch #${identity.branchId}` : null;
      return [address.toLowerCase(), { role, branch }];
    })
  );
  return Object.fromEntries(rows);
}

/** The account's display name (VITE_ACCOUNT_NAMES), if it has one, above its shortened address. */
function AccountName({ address }) {
  const name = accountName(address);
  return (
    <span className="flex flex-col leading-tight">
      {name ? <span className="text-sm font-semibold text-slate-100">{name}</span> : null}
      <span className="whitespace-nowrap font-mono text-xs text-slate-400">{shorten(address, 6, 4)}</span>
    </span>
  );
}

/**
 * The header's account switcher. MetaMask shares with a site only the accounts the user connected to it, and
 * connecting one does not make it the wallet's active account, so picking an account in the extension alone often
 * leaves the page where it was. This lists every account connected to the site, with the role each holds, and adds
 * more through the wallet's own picker.
 */
export default function AccountSwitcher({ buttonStyle, compact = false }) {
  const { account, permittedAccounts = [], selectAccount, switchAccount, isConnecting, isSigningIn } = useWallet();
  const { ledger } = useLedger();
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState({});
  const menuId = useId();
  const rootRef = useRef(null);

  const others = permittedAccounts.filter((a) => !sameAddress(a, account));

  useEffect(() => {
    if (!open || !ledger || permittedAccounts.length === 0) return undefined;
    let cancelled = false;
    describeAccounts(ledger, permittedAccounts)
      .then((next) => !cancelled && setLabels(next))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, ledger, permittedAccounts]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const describe = (address) => {
    const info = labels[address.toLowerCase()];
    if (!info) return "Reading role…";
    const role = ROLE_LABELS[info.role];
    return info.branch ? `${role} · ${info.branch}` : role;
  };

  // MetaMask shows one request at a time: an unanswered sign-in message hides the account picker behind it, and the
  // page could only spin. Say so instead of queueing another request.
  const blockedBySignIn = isSigningIn && !isConnecting;
  const [triedWhileBlocked, setTriedWhileBlocked] = useState(false);
  const waitingHint = isConnecting
    ? "Waiting for MetaMask. If its window shows another request first (for example a sign-in message, \"1 of 2\"), answer that one; the account picker comes next."
    : blockedBySignIn && triedWhileBlocked
      ? "MetaMask is waiting for you to sign the sign-in message. Sign or reject it in MetaMask's window first, then switch account."
      : null;

  // With nothing to choose from yet, the button goes straight to the wallet's picker.
  const onButton = () => {
    if (blockedBySignIn) {
      setTriedWhileBlocked(true);
      return;
    }
    setTriedWhileBlocked(false);
    if (others.length === 0) void switchAccount();
    else setOpen((v) => !v);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="dfl-focusable"
        onClick={onButton}
        disabled={isConnecting}
        aria-disabled={blockedBySignIn || undefined}
        style={buttonStyle}
        aria-haspopup={others.length > 0 ? "menu" : undefined}
        aria-expanded={others.length > 0 ? open : undefined}
        aria-controls={open ? menuId : undefined}
        title="Use another of your wallet's accounts (for example to work as a different role)"
      >
        <Repeat size={14} aria-hidden="true" />
        {compact ? <span className="sr-only">Switch account</span> : isConnecting ? "Waiting for MetaMask…" : "Switch account"}
      </button>
      {waitingHint ? (
        <p role="status" className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-amber-500/40 bg-slate-900 p-3 text-left text-xs text-amber-100 shadow-xl">
          {waitingHint}
        </p>
      ) : null}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Switch account"
          className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-700 bg-slate-900 p-2 text-left shadow-xl"
        >
          <p className="px-2 pb-2 text-xs text-slate-400">Accounts connected to this site</p>
          {account ? (
            <div className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-300">
              <Check className="size-4 text-emerald-400" aria-hidden="true" />
              <AccountName address={account} />
              <span className="ml-auto text-right text-xs text-slate-400">{describe(account)} (current)</span>
            </div>
          ) : null}
          {others.map((address) => (
            <button
              key={address}
              type="button"
              role="menuitem"
              className="dfl-focusable flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
              onClick={() => {
                setOpen(false);
                void selectAccount(address);
              }}
            >
              <span className="size-4" aria-hidden="true" />
              <AccountName address={address} />
              <span className="ml-auto text-right text-xs text-sky-200">{describe(address)}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="dfl-focusable mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md border-0 border-t border-solid border-slate-800 bg-transparent px-2 py-2 text-left text-sm text-sky-300 hover:bg-slate-800"
            onClick={() => {
              setOpen(false);
              void switchAccount();
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Connect another account in MetaMask…
          </button>
        </div>
      ) : null}
    </div>
  );
}
