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
 *   disconnect: () => void      Clears the local session (the wallet itself is not revoked).
 *   error: string | null        Human-readable message for the last failed connect attempt.
 *   isConnecting: boolean       True while a connection request is pending.
 *   clearError: () => void      Dismisses `error`.
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
 *   disconnect: () => void,
 *   error: string | null,
 *   isConnecting: boolean,
 *   clearError: () => void,
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
