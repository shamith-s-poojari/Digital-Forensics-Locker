import { AbiCoder, getAddress, id as keccakId, isAddress, keccak256 } from "ethers";
import { mockCustodyLog, mockEvidence } from "../data/mockData";
import { SAMPLE_CASE_DIGESTS } from "../cases/sampleCases.js";
import { caseGenesis, computeLink, isValidCid } from "./caseChain.js";
import { bytes32ToHex, deriveCaseRef, hexToBytes32, sameAddress } from "./format.js";
import { LedgerError, LEDGER_ERROR } from "./ledgerErrors.js";
import { CUSTODY_ACTIONS } from "./ethersLedger.js";

/**
 * In-memory stand-in for the EvidenceLocker contract, for development and tests only (see isDemoAllowed()).
 * It enforces the same rules, throws the same LedgerError codes, and computes the case chain (caseChain.js) and the
 * custody hash chain with the same algorithms as the contract; ledgerScenarios.js runs against both to keep them in
 * step.
 * Nothing here is persisted or recorded anywhere.
 */

export const DEMO_CHIEF = "0x00000000000000000000000000000000000d3a01";
export const DEMO_AUDITOR = "0x00000000000000000000000000000000000a0d17";

const ZERO_HASH = `0x${"0".repeat(64)}`;
const abi = AbiCoder.defaultAbiCoder();
const ACTION_INDEX = Object.fromEntries(CUSTODY_ACTIONS.map((name, i) => [name, i]));

const lower = (a) => String(a).toLowerCase();
/** The sample data's addresses have made-up mixed-case spellings; normalise to real EIP-55 checksummed ones. */
const toAddress = (a) => getAddress(lower(a));
const flagsFor = (role) => ({
  isChief: role === "chief",
  isAdmin: role === "admin",
  isInvestigator: role === "investigator",
  isAuditor: role === "auditor",
});

function entryHash(prev, action, actor, counterparty, timestamp, noteHash) {
  return keccak256(
    abi.encode(
      ["bytes32", "uint8", "address", "address", "uint64", "bytes32"],
      [
        prev,
        ACTION_INDEX[action],
        lower(actor),
        lower(counterparty ?? "0x0000000000000000000000000000000000000000"),
        timestamp,
        noteHash ? hexToBytes32(noteHash) : ZERO_HASH,
      ]
    )
  );
}

function recomputeHead(entries) {
  return entries.reduce((head, e) => entryHash(head, e.action, e.actor, e.counterparty, e.timestamp, e.noteHash), ZERO_HASH);
}

/** The case-chain fields of a new record: its position in the case and its link to the previous record. */
function nextLink(evidence, caseRef, record) {
  const previous = evidence.filter((e) => e.caseRef === caseRef);
  const prior = previous.length ? previous[previous.length - 1].link : caseGenesis(caseRef);
  return { caseIndex: previous.length, link: computeLink(prior, record) };
}

function parseSampleTime(text) {
  return Math.floor(Date.parse(`${text.replace(" ", "T")}Z`) / 1000);
}

function seedEvidence(store) {
  mockEvidence.forEach((m, i) => {
    const submitter = toAddress(m.submittedBy);
    const submittedAt = parseSampleTime(m.timestamp);
    const custody = [{ index: 0, action: "Submitted", actor: submitter, counterparty: null, timestamp: submittedAt, noteHash: null }];

    for (const log of mockCustodyLog.filter((l) => l.cidHash === m.cid && l.eventType !== "Submit")) {
      custody.push({
        index: custody.length,
        action: log.eventType === "Verify" ? "VerifiedMatch" : "Accessed",
        actor: toAddress(log.actor),
        counterparty: null,
        timestamp: parseSampleTime(log.timestamp),
        noteHash: null,
      });
    }
    if (m.status === "Flagged") {
      custody.push({ index: custody.length, action: "VerifiedMismatch", actor: submitter, counterparty: null, timestamp: submittedAt + 3600, noteHash: null });
    }

    const caseRef = deriveCaseRef(m.caseId);
    store.evidence.push({
      id: i + 1,
      caseRef,
      sha256: m.hash,
      cid: m.cid,
      submitter,
      custodian: submitter,
      submittedAt,
      custodyCount: custody.length,
      custodyHead: bytes32ToHex(recomputeHead(custody)),
      ...nextLink(store.evidence, caseRef, { sha256: m.hash, cid: m.cid, officer: submitter, timestamp: submittedAt }),
      caseDigest: SAMPLE_CASE_DIGESTS[caseRef],
      custody,
    });
    store.roles.set(lower(submitter), flagsFor("investigator"));
  });
  // A dedicated sample auditor (a distinct address, so no submitter loses their investigator role).
  store.roles.set(lower(DEMO_AUDITOR), flagsFor("auditor"));
}

/**
 * Shared state for one demo "chain". Several ledgers (one per acting account) can share a store, which is how the
 * scenario suite plays several actors against the same state.
 *
 * @param {object} [options]
 * @param {{ chief?: string | null, admins?: string[], investigators?: string[], auditors?: string[] }} [options.roles]
 *        Real wallets to authorise from the start (see readDemoRoles in config.js). `chief` replaces the sample Chief.
 *        Any other address holds no role until it is granted one.
 */
export function createDemoStore({ now = () => Math.floor(Date.now() / 1000), seed = true, roles } = {}) {
  const store = {
    now,
    chief: DEMO_CHIEF,
    roles: new Map([[lower(DEMO_CHIEF), flagsFor("chief")]]),
    evidence: [],
    paused: false,
    block: 1000,
    txCounter: 0,
    listeners: new Set(),
    changed() {
      for (const listener of store.listeners) listener();
    },
    /** Replaces the roles of one address (used by tests). There is one Chief at a time. */
    setRole(address, role) {
      if (role === "chief" && lower(store.chief) !== lower(address)) {
        const previous = store.roles.get(lower(store.chief));
        if (previous) store.roles.set(lower(store.chief), { ...previous, isChief: false });
        store.chief = address;
      }
      store.roles.set(lower(address), flagsFor(role));
      store.changed();
    },
  };
  if (seed) seedEvidence(store);

  if (roles?.chief) {
    store.roles.delete(lower(DEMO_CHIEF));
    store.chief = roles.chief;
    store.roles.set(lower(roles.chief), flagsFor("chief"));
  }
  // Additive, like grantRole: one address may hold several roles (for example the Chief who is also an investigator).
  const grant = (address, flag) => store.roles.set(lower(address), { ...(store.roles.get(lower(address)) ?? flagsFor("none")), [flag]: true });
  for (const address of roles?.admins ?? []) grant(address, "isAdmin");
  for (const address of roles?.investigators ?? []) grant(address, "isInvestigator");
  for (const address of roles?.auditors ?? []) grant(address, "isAuditor");
  return store;
}

const sleep = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/**
 * @param {object} options
 * @param {ReturnType<typeof createDemoStore>} options.store
 * @param {string | null} options.account  The acting address (the "connected wallet").
 * @param {number} [options.signDelayMs]   Simulated time the wallet takes to sign.
 * @param {number} [options.confirmDelayMs] Simulated time to mine.
 */
export function createDemoLedger({ store, account, signDelayMs = 700, confirmDelayMs = 1200 }) {
  const flags = (address) => store.roles.get(lower(address)) ?? flagsFor("none");
  /** The acting account must hold at least one of the given role flags. */
  const need = (...anyOf) => {
    if (!account || !anyOf.some((flag) => flags(account)[flag])) throw new LedgerError(LEDGER_ERROR.NOT_AUTHORIZED);
  };
  const ROLE_FLAG = { admin: "isAdmin", investigator: "isInvestigator", auditor: "isAuditor" };
  /** Same rule as the contract: only the Chief manages Admins; the Chief or an Admin manages the working roles. */
  const needRoleManager = (role) => {
    if (!ROLE_FLAG[role]) throw new LedgerError(LEDGER_ERROR.INVALID_INPUT);
    if (role === "admin") need("isChief");
    else need("isChief", "isAdmin");
  };
  const live = () => {
    if (store.paused) throw new LedgerError(LEDGER_ERROR.PAUSED);
  };
  const find = (id) => {
    const ev = store.evidence.find((e) => e.id === id);
    if (!ev) throw new LedgerError(LEDGER_ERROR.UNKNOWN_EVIDENCE, undefined, { id });
    return ev;
  };
  const clone = (ev) => ({ ...ev, custody: ev.custody.map((c) => ({ ...c })) });

  function append(ev, action, counterparty, noteHash) {
    const timestamp = store.now();
    const entry = { index: ev.custody.length, action, actor: account, counterparty: counterparty ?? null, timestamp, noteHash: noteHash ? bytes32ToHex(noteHash) : null };
    ev.custodyHead = bytes32ToHex(entryHash(hexToBytes32(ev.custodyHead || ZERO_HASH), action, account, counterparty, timestamp, noteHash));
    ev.custody.push(entry);
    ev.custodyCount = ev.custody.length;
  }

  /** Validates and applies immediately (like a contract call that does not revert), then simulates signing and mining. */
  async function transact(apply) {
    const result = apply();
    await sleep(signDelayMs);
    store.txCounter += 1;
    const hash = keccakId(`demo-tx-${store.txCounter}`);
    store.block += 1;
    const blockNumber = store.block;
    return {
      hash,
      wait: async () => {
        await sleep(confirmDelayMs);
        store.changed();
        return { hash, blockNumber, evidenceId: result?.evidenceId ?? null };
      },
    };
  }

  const requireInvestigator = (address) => {
    if (!isAddress(address) || !flags(address).isInvestigator) throw new LedgerError(LEDGER_ERROR.INVALID_RECIPIENT);
    return getAddress(address);
  };

  return {
    kind: "demo",

    getRoles: async (address) => ({ ...flags(address) }),
    listEvidence: async () => store.evidence.map(clone),
    getEvidence: async (id) => clone(find(id)),
    findEvidence: async (caseRef, sha256) =>
      store.evidence.find((e) => e.caseRef === caseRef && e.sha256 === bytes32ToHex(hexToBytes32(sha256)))?.id ?? null,
    verifyHash: async (id, sha256) => find(id).sha256 === bytes32ToHex(hexToBytes32(sha256)),
    verifyChain: async (id) => {
      const ev = find(id);
      return bytes32ToHex(recomputeHead(ev.custody)) === ev.custodyHead;
    },
    getCustodyTxs: async (id) => {
      find(id);
      return {}; // the demo has no transactions to link to
    },
    listRoleMembers: async () => {
      const members = { chief: getAddress(lower(store.chief)), admins: [], investigators: [], auditors: [] };
      for (const [address, f] of store.roles) {
        if (f.isAdmin) members.admins.push(getAddress(address));
        if (f.isInvestigator) members.investigators.push(getAddress(address));
        if (f.isAuditor) members.auditors.push(getAddress(address));
      }
      return members;
    },
    isPaused: async () => store.paused,

    registerEvidence: ({ caseRef, sha256, cid, caseDigest }) =>
      transact(() => {
        need("isInvestigator");
        live();
        const hash = bytes32ToHex(hexToBytes32(sha256));
        if (caseRef === ZERO_HASH || /^0+$/.test(hash)) throw new LedgerError(LEDGER_ERROR.INVALID_INPUT);
        const digest = caseDigest ? bytes32ToHex(hexToBytes32(caseDigest)) : "";
        if (!digest || /^0+$/.test(digest)) throw new LedgerError(LEDGER_ERROR.INVALID_INPUT);
        if (!isValidCid(cid)) throw new LedgerError(LEDGER_ERROR.INVALID_INPUT);
        const existing = store.evidence.find((e) => e.caseRef === caseRef && e.sha256 === hash);
        if (existing) throw new LedgerError(LEDGER_ERROR.DUPLICATE, undefined, { existingId: existing.id });

        const submittedAt = store.now();
        const ev = {
          id: store.evidence.length + 1,
          caseRef,
          sha256: hash,
          cid,
          submitter: account,
          custodian: account,
          submittedAt,
          custodyCount: 0,
          custodyHead: bytes32ToHex(ZERO_HASH),
          ...nextLink(store.evidence, caseRef, { sha256: hash, cid, officer: account, timestamp: submittedAt }),
          caseDigest: digest,
          custody: [],
        };
        append(ev, "Submitted", null, null);
        store.evidence.push(ev);
        return { evidenceId: ev.id };
      }),

    logAccess: (id, noteHash) =>
      transact(() => {
        need("isInvestigator");
        live();
        append(find(id), "Accessed", null, noteHash);
      }),

    logVerification: (id, sha256, noteHash) =>
      transact(() => {
        need("isInvestigator");
        live();
        const ev = find(id);
        append(ev, ev.sha256 === bytes32ToHex(hexToBytes32(sha256)) ? "VerifiedMatch" : "VerifiedMismatch", null, noteHash);
      }),

    transferCustody: (id, to, noteHash) =>
      transact(() => {
        need("isInvestigator");
        live();
        const ev = find(id);
        if (!sameAddress(ev.custodian, account)) throw new LedgerError(LEDGER_ERROR.NOT_CUSTODIAN, undefined, { custodian: ev.custodian });
        const recipient = requireInvestigator(to);
        if (sameAddress(recipient, account)) throw new LedgerError(LEDGER_ERROR.INVALID_RECIPIENT);
        ev.custodian = recipient;
        append(ev, "Transferred", recipient, noteHash);
      }),

    reassignCustody: (id, to, noteHash) =>
      transact(() => {
        need("isChief");
        const ev = find(id);
        const recipient = requireInvestigator(to);
        ev.custodian = recipient;
        append(ev, "Reassigned", recipient, noteHash);
      }),

    grantRole: (role, address) =>
      transact(() => {
        needRoleManager(role);
        if (!isAddress(address)) throw new LedgerError(LEDGER_ERROR.INVALID_INPUT);
        store.roles.set(lower(address), { ...flags(address), [ROLE_FLAG[role]]: true });
      }),

    revokeRole: (role, address) =>
      transact(() => {
        needRoleManager(role);
        if (!isAddress(address)) throw new LedgerError(LEDGER_ERROR.INVALID_INPUT);
        store.roles.set(lower(address), { ...flags(address), [ROLE_FLAG[role]]: false });
      }),

    pause: () =>
      transact(() => {
        need("isChief", "isAdmin");
        store.paused = true;
      }),
    unpause: () =>
      transact(() => {
        need("isChief", "isAdmin");
        store.paused = false;
      }),

    subscribe(callback) {
      store.listeners.add(callback);
      return () => store.listeners.delete(callback);
    },

    /**
     * Demo only. True while no real wallet is the Chief (VITE_DEMO_CHIEF unset and nobody has claimed it), so a
     * developer is never stuck with nobody able to approve access. A real contract gets its Chief at deployment.
     */
    isChiefUnclaimed: () => lower(store.chief) === lower(DEMO_CHIEF),
    claimChief: async () => {
      if (!account || lower(store.chief) !== lower(DEMO_CHIEF)) throw new LedgerError(LEDGER_ERROR.NOT_AUTHORIZED);
      store.setRole(account, "chief");
    },
  };
}
