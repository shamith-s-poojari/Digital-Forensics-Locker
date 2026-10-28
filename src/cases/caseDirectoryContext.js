import { createContext, useContext } from "react";

/**
 * The case directory: the off-chain titles and descriptions of cases, with their version history. Provided by
 * CaseDirectoryProvider (src/cases/CaseDirectoryProvider.jsx). Lives in a plain .js module so the provider file only
 * exports a component (react-refresh).
 *
 * Value:
 *   status: "unavailable" | "loading" | "ready" | "signed-out" | "error"
 *   cases: Case[]                          see src/cases/caseStores.js
 *   byRef: Map<caseRef, Case>
 *   error: string | null
 *   reload(): Promise<void>
 *   create({ caseNumber, title, description }): Promise<Case>
 *   addVersion(caseRef, { title, description }): Promise<Case>
 *   currentDigest(caseRef): string | null   digest of the current version, recomputed from its fields
 */
export const CaseDirectoryContext = createContext(null);

const unavailable = async () => {
  throw new Error("No case store is available.");
};

export const UNAVAILABLE_DIRECTORY = Object.freeze({
  status: "unavailable",
  cases: [],
  byRef: new Map(),
  error: null,
  reload: async () => {},
  create: unavailable,
  addVersion: unavailable,
  currentDigest: () => null,
});

/** Reads the case directory. Outside a provider it reports "unavailable" rather than throwing. */
export function useCaseDirectory() {
  return useContext(CaseDirectoryContext) ?? UNAVAILABLE_DIRECTORY;
}
