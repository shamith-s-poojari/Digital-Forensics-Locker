import { createContext, useContext } from "react";

/**
 * Wallet context object. Provided by `WalletProvider` (src/context/WalletContext.jsx).
 * Lives in a plain .js module so the provider file only exports a component
 * (required by react-refresh fast refresh).
 *
 * Value shape:
 *   account: string | null      Connected account address (as returned by the wallet), or null.
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
