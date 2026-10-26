/**
 * One error type for everything that can go wrong when talking to the ledger (the real contract or the demo),
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

/** Turns anything thrown by ethers (or by our own code) into a LedgerError. Never throws. */
export function normalizeError(err) {
  if (err instanceof LedgerError) return err;

  if (isUserRejection(err)) {
    return new LedgerError(LEDGER_ERROR.USER_REJECTED, "The request was rejected in the wallet.");
  }

  const revertName = err?.revert?.name ?? err?.errorName;
  if (revertName && REVERT_NAME_TO_CODE[revertName]) {
    const details = {};
    if (revertName === "DuplicateEvidence" && err?.revert?.args?.[0] !== undefined) {
      details.existingId = Number(err.revert.args[0]);
    }
    if (revertName === "NotCustodian" && err?.revert?.args?.[0] !== undefined) {
      details.custodian = String(err.revert.args[0]);
    }
    return new LedgerError(REVERT_NAME_TO_CODE[revertName], `Contract reverted: ${revertName}`, details);
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
