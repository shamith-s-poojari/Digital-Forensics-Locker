import { createContext, useContext } from "react";

/**
 * Wallet context object. Provided by `WalletProvider` (src/context/WalletContext.jsx).
 * Lives in a plain .js module so the provider file only exports a component
 * (required by react-refresh fast refresh).
 *
 * Value shape:
 *   account: string | null      Connected account address (as returned by the wallet), or null.
 *   chainId: number | null      Chain the wallet is on (null until known, or when disconnected).
 *   switchChain: (id) => Promise<boolean>  Asks the wallet to switch network; sets `error` on failure.
 *   connect: () => Promise<void> Requests account access; never throws, sets `error` on failure.
 *   switchAccount: () => Promise<void>  Opens the wallet's account picker to connect more accounts to this site
 *                               (MetaMask hides accounts not connected here); switches when exactly one new account
 *                               was connected. Never throws, sets `error` on failure.
 *   permittedAccounts: string[] Every account the wallet shares with this site, the wallet's active one first.
 *   selectAccount: (address) => Promise<void>  Acts as another shared account (signs in as it), without changing
 *                               the wallet's own active account.
 *   disconnect: () => void      Ends the session here and on the server, and asks the wallet to drop this site's
 *                               account permission (best effort), so the next connect starts from scratch.
 *   error: string | null        Human-readable message for the last failed connect attempt.
 *   isConnecting: boolean       True while a connection request is pending.
 *   clearError: () => void      Dismisses `error`.
 *   session: { address, chainId, expiresAt } | null   Server sign-in session (EIP-4361), or null.
 *   isSignedIn: boolean         True when `session` belongs to `account`.
 *   isSigningIn: boolean        True while the wallet's sign-in prompt is open.
 *   signIn: () => Promise<{ ok: boolean, error?: string }>         Signs in as `account`.
 *   ensureSession: () => Promise<{ ok: boolean, error?: string }>  Call before every evidence action: re-checks the
 *                               wallet's selected account and asks for a fresh signature when needed.
 *   notice: string | null       Why the session ended (wallet locked, account switched, expired).
 *   clearNotice: () => void     Dismisses `notice`.
 */
export const WalletContext = createContext(null);

/**
 * Reads the wallet context.
 *
 * @returns {{
 *   account: string | null,
 *   chainId: number | null,
 *   switchChain: (chainId: number) => Promise<boolean>,
 *   connect: () => Promise<void>,
 *   switchAccount: () => Promise<void>,
 *   permittedAccounts: string[],
 *   selectAccount: (address: string) => Promise<void>,
 *   disconnect: () => void,
 *   error: string | null,
 *   isConnecting: boolean,
 *   clearError: () => void,
 *   session: { address: string, chainId: number, expiresAt: number } | null,
 *   isSignedIn: boolean,
 *   isSigningIn: boolean,
 *   signIn: () => Promise<{ ok: true } | { ok: false, error: string }>,
 *   ensureSession: () => Promise<{ ok: true } | { ok: false, error: string }>,
 *   notice: string | null,
 *   clearNotice: () => void,
 * }}
 * @throws {Error} If called outside of a `<WalletProvider>`.
 */
export function useWallet() {
  const context = useContext(WalletContext);
  if (context === null) {
    throw new Error("useWallet must be used within a <WalletProvider>. Wrap your app in <WalletProvider>.");
  }
  return context;
}

/** "0xaa36a7" or 11155111 -> 11155111; anything else -> null. */
export function parseChainId(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  return null;
}
