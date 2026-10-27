import { Contract, getAddress, id as keccakId, isAddress, toBeHex } from "ethers";
import { bytes32ToHex, hexToBytes32 } from "./format.js";
import { LedgerError, LEDGER_ERROR, normalizeError } from "./ledgerErrors.js";

/**
 * The ledger adapter: everything the UI needs from the chain, behind one interface with two implementations
 * (this one, and demoLedger.js). Both throw LedgerError with the same codes, and the same scenario suite
 * (ledgerScenarios.js) runs against both, so the demo cannot drift from the real contract.
 *
 * Shapes
 *   RoleFlags   { isAdmin, isInvestigator, isAuditor }
 *   Evidence    { id, caseRef, sha256, cid, submitter, custodian, submittedAt, custodyCount, custodyHead, link, caseIndex,
 *                 custody[] }   (link: this record's case-chain value h_i; caseIndex: its position in the case)
 *   Custody     { index, action, actor, counterparty|null, timestamp, noteHash|null }
 *   TxHandle    { hash, wait(confirmations?) -> { hash, blockNumber, evidenceId|null } }  (hash is known once the
 *               wallet has signed; wait() resolves when the transaction is mined)
 */

/** Same order as the Solidity enum CustodyAction. */
export const CUSTODY_ACTIONS = ["Submitted", "Accessed", "Transferred", "VerifiedMatch", "VerifiedMismatch", "Reassigned"];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = `0x${"0".repeat(64)}`;

/** Role ids are keccak256 of the role name, exactly as in the contract. */
export const ROLE_IDS = Object.freeze({
  investigator: keccakId("INVESTIGATOR_ROLE"),
  auditor: keccakId("AUDITOR_ROLE"),
});

function toCustody(index, entry) {
  return {
    index,
    action: CUSTODY_ACTIONS[Number(entry.action)] ?? "Unknown",
    actor: entry.actor,
    counterparty: entry.counterparty === ZERO_ADDRESS ? null : entry.counterparty,
    timestamp: Number(entry.timestamp),
    noteHash: entry.noteHash === ZERO_HASH ? null : bytes32ToHex(entry.noteHash),
  };
}

function toEvidence(id, ev, custody) {
  return {
    id,
    // The contract's caseId is a uint256; the app keeps the same 32 bytes as a 0x-prefixed hex string.
    caseRef: toBeHex(ev.caseId, 32),
    sha256: bytes32ToHex(ev.sha256Hash),
    cid: ev.cid,
    submitter: ev.submitter,
    custodian: ev.custodian,
    submittedAt: Number(ev.submittedAt),
    custodyCount: Number(ev.custodyCount),
    custodyHead: bytes32ToHex(ev.custodyHead),
    link: bytes32ToHex(ev.link),
    caseIndex: Number(ev.caseIndex),
    custody,
  };
}

/**
 * @param {object} options
 * @param {import("ethers").Provider} options.provider        Read-only provider.
 * @param {() => Promise<import("ethers").Signer>} options.getSigner  Resolves the wallet signer for writes.
 * @param {string} options.address                             Deployed EvidenceLocker address.
 * @param {import("ethers").InterfaceAbi} options.abi
 * @param {number} [options.deployBlock]                       Where to start scanning event logs.
 * @param {number} [options.logChunk]                          Max blocks per log query (public RPCs cap this).
 */
export function createEthersLedger({ provider, getSigner, address, abi, deployBlock = 0, logChunk = 9000 }) {
  const reader = new Contract(address, abi, provider);

  const guard = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      throw normalizeError(err, reader.interface);
    }
  };

  const range = (n) => Array.from({ length: n }, (_, i) => i);

  async function readRecord(id) {
    const [ev, length] = await Promise.all([reader.getEvidence(id), reader.custodyLength(id)]);
    const entries = await Promise.all(range(Number(length)).map((i) => reader.getCustodyEntry(id, i)));
    return toEvidence(id, ev, entries.map((e, i) => toCustody(i, e)));
  }

  async function queryChunked(filter) {
    const latest = await provider.getBlockNumber();
    const logs = [];
    for (let from = deployBlock; from <= latest; from += logChunk) {
      logs.push(...(await reader.queryFilter(filter, from, Math.min(from + logChunk - 1, latest))));
    }
    return logs;
  }

  /** Sends a state-changing call. Resolves once the wallet has signed; the handle's wait() resolves when mined. */
  function send(method, args) {
    return guard(async () => {
      const writer = new Contract(address, abi, await getSigner());
      const tx = await writer[method](...args);
      return {
        hash: tx.hash,
        wait: (confirmations = 1) =>
          guard(async () => {
            const receipt = await tx.wait(confirmations);
            if (!receipt) throw new LedgerError(LEDGER_ERROR.UNKNOWN, "The transaction was replaced or dropped.");
            let evidenceId = null;
            for (const log of receipt.logs) {
              try {
                const parsed = writer.interface.parseLog(log);
                if (parsed?.name === "EvidenceRegistered") evidenceId = Number(parsed.args.id);
              } catch {
                /* a log from another contract: ignore */
              }
            }
            return { hash: tx.hash, blockNumber: receipt.blockNumber, evidenceId };
          }),
      };
    });
  }

  const requireRoleName = (role) => {
    if (!ROLE_IDS[role]) throw new LedgerError(LEDGER_ERROR.INVALID_INPUT, `Unknown role "${role}"`);
    return ROLE_IDS[role];
  };
  const requireAddress = (value) => {
    if (!isAddress(value)) throw new LedgerError(LEDGER_ERROR.INVALID_INPUT, "Not a valid address");
    return getAddress(value);
  };
  const note = (noteHash) => (noteHash ? hexToBytes32(noteHash) : ZERO_HASH);

  return {
    kind: "chain",

    // ---- reads ---------------------------------------------------------------------------------------------
    getRoles: (account) =>
      guard(async () => {
        const [isAdmin, isInvestigator, isAuditor] = await reader.rolesOf(account);
        return { isAdmin, isInvestigator, isAuditor };
      }),

    listEvidence: () =>
      guard(async () => {
        const total = Number(await reader.totalEvidence());
        const ids = range(total).map((i) => i + 1);
        const out = [];
        for (let i = 0; i < ids.length; i += 8) out.push(...(await Promise.all(ids.slice(i, i + 8).map(readRecord))));
        return out;
      }),

    getEvidence: (id) => guard(() => readRecord(id)),

    findEvidence: (caseRef, sha256) =>
      guard(async () => {
        const id = Number(await reader.findEvidence(caseRef, hexToBytes32(sha256)));
        return id === 0 ? null : id;
      }),

    /** Read-only integrity check against the ledger (no transaction). */
    verifyHash: (id, sha256) => guard(() => reader.verify(id, hexToBytes32(sha256))),

    /** Asks the contract to recompute the custody hash chain and compare it with the stored head. */
    verifyChain: (id) => guard(() => reader.verifyCustodyChain(id)),

    /** Transaction hash and block for each custody entry of one evidence record (scans event logs). */
    getCustodyTxs: (id) =>
      guard(async () => {
        const logs = await queryChunked(reader.filters.CustodyRecorded(id));
        const byIndex = {};
        for (const log of logs) byIndex[Number(log.args.index)] = { txHash: log.transactionHash, blockNumber: log.blockNumber };
        return byIndex;
      }),

    listRoleMembers: () =>
      guard(async () => {
        const [admin, investigators, auditors] = await Promise.all([
          reader.defaultAdmin(),
          reader.getRoleMembers(ROLE_IDS.investigator),
          reader.getRoleMembers(ROLE_IDS.auditor),
        ]);
        return { admin, investigators: [...investigators], auditors: [...auditors] };
      }),

    isPaused: () => guard(() => reader.paused()),

    // ---- writes (each returns a TxHandle once the wallet has signed) --------------------------------------
    registerEvidence: ({ caseRef, sha256, cid }) => send("registerEvidence", [caseRef, hexToBytes32(sha256), cid]),
    logAccess: (id, noteHash) => send("logAccess", [id, note(noteHash)]),
    logVerification: (id, sha256, noteHash) => send("logVerification", [id, hexToBytes32(sha256), note(noteHash)]),
    transferCustody: (id, to, noteHash) => send("transferCustody", [id, requireAddress(to), note(noteHash)]),
    reassignCustody: (id, to, noteHash) => send("reassignCustody", [id, requireAddress(to), note(noteHash)]),
    grantRole: (role, account) => send("grantRole", [requireRoleName(role), requireAddress(account)]),
    revokeRole: (role, account) => send("revokeRole", [requireRoleName(role), requireAddress(account)]),
    pause: () => send("pause", []),
    unpause: () => send("unpause", []),

    // ---- live updates ---------------------------------------------------------------------------------------
    /** Calls `callback` (debounced) whenever roles, evidence or custody change. Returns an unsubscribe function. */
    subscribe(callback) {
      const events = ["RoleGranted", "RoleRevoked", "EvidenceRegistered", "CustodyRecorded", "Paused", "Unpaused"];
      let timer;
      const notify = () => {
        clearTimeout(timer);
        timer = setTimeout(callback, 250);
      };
      for (const name of events) reader.on(name, notify).catch(() => {});
      return () => {
        clearTimeout(timer);
        for (const name of events) reader.off(name, notify).catch(() => {});
      };
    },
  };
}
