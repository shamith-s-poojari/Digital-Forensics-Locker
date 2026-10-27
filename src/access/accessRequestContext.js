import { createContext, useContext } from "react";

/**
 * Access requests: a wallet with no role asks the Chief for one. Provided by AccessRequestProvider
 * (src/access/AccessRequestProvider.jsx). Lives in a plain .js module so the provider file only exports a component.
 *
 * Value:
 *   status: "unavailable" | "loading" | "ready" | "signed-out" | "error"
 *   mine: Request | null          the connected wallet's latest request (see accessRequestStores.js)
 *   pending: Request[]            every pending request (for the Chief)
 *   error: string | null
 *   reload(): Promise<void>
 *   submit({ role, reason }): Promise<Request>
 *   resolve(id, "approved" | "rejected"): Promise<Request>
 */
export const AccessRequestContext = createContext(null);

const unavailable = async () => {
  throw new Error("Access requests are not available.");
};

export const UNAVAILABLE_REQUESTS = Object.freeze({
  status: "unavailable",
  mine: null,
  pending: [],
  error: null,
  reload: async () => {},
  submit: unavailable,
  resolve: unavailable,
});

/** Reads the access requests. Outside a provider it reports "unavailable" rather than throwing. */
export function useAccessRequests() {
  return useContext(AccessRequestContext) ?? UNAVAILABLE_REQUESTS;
}
