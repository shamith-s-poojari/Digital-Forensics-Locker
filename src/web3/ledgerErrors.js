/**
 * One error type for everything that can go wrong when talking to the ledger (the real contract or the in-memory test ledger),
 * so the UI shows the same, human wording whichever implementation is active.
 */

export const LEDGER_ERROR = Object.freeze({
  USER_REJECTED: "UserRejected",
  NOT_AUTHORIZED: "NotAuthorized",
  PAUSED: "Paused",
  DUPLICATE: "DuplicateEvidence",
  UNKNOWN_EVIDENCE: "UnknownEvidence",
  NOT_CUSTODIAN: "NotCustodian",
  INVALID_RECIPIENT: "InvalidRecipient",
  INVALID_INPUT: "InvalidInput",
  INSUFFICIENT_FUNDS: "InsufficientFunds",
  NETWORK: "Network",
  UNKNOWN: "Unknown",
});

export class LedgerError extends Error {
  /**
   * @param {string} code One of LEDGER_ERROR.
   * @param {string} [message] Technical message (optional; the UI uses `friendlyMessage`).
   * @param {Record<string, unknown>} [details] Extra data, for example `{ existingId }` for duplicates.
   */
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "LedgerError";
    this.code = code;
    this.details = details;
  }
}

/** Contract custom error name -> ledger error code. */
const REVERT_NAME_TO_CODE = {
  AccessControlUnauthorizedAccount: LEDGER_ERROR.NOT_AUTHORIZED,
  EnforcedPause: LEDGER_ERROR.PAUSED,
  DuplicateEvidence: LEDGER_ERROR.DUPLICATE,
  UnknownEvidence: LEDGER_ERROR.UNKNOWN_EVIDENCE,
  NotCustodian: LEDGER_ERROR.NOT_CUSTODIAN,
  InvalidRecipient: LEDGER_ERROR.INVALID_RECIPIENT,
  ZeroValue: LEDGER_ERROR.INVALID_INPUT,
  InvalidCid: LEDGER_ERROR.INVALID_INPUT,
};

function isUserRejection(err) {
  return (
    err?.code === "ACTION_REJECTED" ||
    err?.code === 4001 ||
    err?.info?.error?.code === 4001 ||
    err?.error?.code === 4001
  );
}

const REVERT_DATA = /^0x[0-9a-fA-F]{8,}$/;

/** Collects hex strings that could be ABI-encoded revert data, wherever a provider happened to put them. */
function findRevertData(value, depth = 0, seen = new Set()) {
  if (depth > 5 || value === null || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (typeof child === "string") {
      if (REVERT_DATA.test(child)) found.push(child);
    } else {
      found.push(...findRevertData(child, depth + 1, seen));
    }
  }
  return found;
}

/**
 * Works out which custom error a failed call reverted with. Different wallets and nodes report the revert data in
 * different places (and a plain "reverted with custom error 'X(...)'" message is all a local node gives), so we
 * decode any hex data in the error against the contract ABI instead of trusting one field.
 */
function decodeRevert(err, iface) {
  if (err?.revert?.name) return { name: err.revert.name, args: err.revert.args ?? [] };
  if (err?.errorName) return { name: err.errorName, args: err.errorArgs ?? [] };

  if (iface) {
    for (const data of findRevertData(err)) {
      try {
        const parsed = iface.parseError(data);
        if (parsed) return { name: parsed.name, args: [...parsed.args] };
      } catch {
        /* not revert data for this contract */
      }
    }
  }

  const named = /custom error '([A-Za-z0-9_]+)\(/.exec(String(err?.message ?? err?.shortMessage ?? ""));
  return named ? { name: named[1], args: [] } : null;
}

/**
 * Turns anything thrown by ethers (or by our own code) into a LedgerError. Never throws.
 * @param {unknown} err
 * @param {import("ethers").Interface} [iface] The contract interface, used to decode revert data.
 */
export function normalizeError(err, iface) {
  if (err instanceof LedgerError) return err;

  if (isUserRejection(err)) {
    return new LedgerError(LEDGER_ERROR.USER_REJECTED, "The request was rejected in the wallet.");
  }

  const revert = decodeRevert(err, iface);
  if (revert && REVERT_NAME_TO_CODE[revert.name]) {
    const details = {};
    if (revert.name === "DuplicateEvidence" && revert.args[0] !== undefined) details.existingId = Number(revert.args[0]);
    if (revert.name === "NotCustodian" && revert.args[0] !== undefined) details.custodian = String(revert.args[0]);
    return new LedgerError(REVERT_NAME_TO_CODE[revert.name], `Contract reverted: ${revert.name}`, details);
  }

  if (err?.code === "INSUFFICIENT_FUNDS") {
    return new LedgerError(LEDGER_ERROR.INSUFFICIENT_FUNDS, "The wallet has too little ETH for the network fee.");
  }
  if (["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT", "UNKNOWN_ERROR"].includes(err?.code)) {
    return new LedgerError(LEDGER_ERROR.NETWORK, "Could not reach the network.");
  }

  return new LedgerError(LEDGER_ERROR.UNKNOWN, err?.shortMessage ?? err?.message ?? "Unexpected error");
}

const FRIENDLY = {
  [LEDGER_ERROR.USER_REJECTED]: () => "You rejected the request in your wallet. Nothing was sent.",
  [LEDGER_ERROR.NOT_AUTHORIZED]: () => "Your wallet is not authorised for this action. Ask the Chief to check your role.",
  [LEDGER_ERROR.PAUSED]: () => "The system is paused by the Chief. No evidence can be recorded until it is resumed.",
  [LEDGER_ERROR.DUPLICATE]: (d) =>
    d?.existingId ? `This file is already registered for this case as evidence #${d.existingId}.` : "This file is already registered for this case.",
  [LEDGER_ERROR.UNKNOWN_EVIDENCE]: () => "That evidence record does not exist.",
  [LEDGER_ERROR.NOT_CUSTODIAN]: () => "Only the current custodian can transfer this evidence.",
  [LEDGER_ERROR.INVALID_RECIPIENT]: () => "The recipient must be a different address that holds the Investigator role.",
  [LEDGER_ERROR.INVALID_INPUT]: () => "The request contained an empty or invalid value.",
  [LEDGER_ERROR.INSUFFICIENT_FUNDS]: () => "Your wallet needs a little test ETH to pay the network fee.",
  [LEDGER_ERROR.NETWORK]: () => "Could not reach the blockchain network. Check your connection and the selected network, then retry.",
  [LEDGER_ERROR.UNKNOWN]: () => "Something went wrong. Please try again.",
};

/** A sentence safe to show to a user for any error. */
export function friendlyMessage(err) {
  const e = normalizeError(err);
  return (FRIENDLY[e.code] ?? FRIENDLY[LEDGER_ERROR.UNKNOWN])(e.details);
}
