import { readAccountNames } from "./config.js";
import { shorten } from "./format.js";

/** Display names from VITE_ACCOUNT_NAMES (see config.js), read once. */
const NAMES = readAccountNames();

/** The display name given to an address, or null. Labels only: a name grants nothing. */
export function accountName(address, names = NAMES) {
  return address ? (names.get(String(address).toLowerCase()) ?? null) : null;
}

/** "Investigator 1 (0xE07c…2dAe)" for a named address, otherwise the shortened address. */
export function accountLabel(address, names = NAMES) {
  if (!address) return "";
  const name = accountName(address, names);
  return name ? `${name} (${shorten(address, 6, 4)})` : shorten(address, 6, 4);
}
