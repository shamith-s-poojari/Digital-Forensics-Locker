// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title EvidenceLocker
 * @notice On-chain register of digital-evidence integrity records and their chain of custody, with role-based
 *         write access.
 *
 * Roles
 *  - Admin (the "Chief"): OpenZeppelin DEFAULT_ADMIN_ROLE. Grants and revokes the two working roles, pauses the
 *    contract and can reassign stranded custody. Transferring the admin role is two-step and time-delayed
 *    (AccessControlDefaultAdminRules). The admin can NOT register or log evidence unless it is also given the
 *    investigator role: separation of duties.
 *  - Investigator: registers evidence, logs access and verification, transfers custody.
 *  - Auditor: holds no write permission. Everything is readable by everyone (see below), so the role exists to
 *    make the audience explicit and for the UI; it grants no on-chain secrecy.
 *
 * Privacy (read this before deploying anywhere public)
 *  Blockchain state is public. Restricting a view function would only create a false sense of privacy, so views
 *  are open. The contract therefore stores ONLY: a SHA-256 of the evidence bytes, the content identifier (CID) of
 *  the stored (encrypted) copy, an opaque case reference (hash a case number with a secret salt off-chain; never
 *  put a plaintext case number, name or file name on chain) and addresses. Addresses are pseudonymous but linkable
 *  to people over time: for real law-enforcement use deploy on a permissioned or private network, not a public one.
 *
 * Integrity
 *  Each evidence record carries a hash chain over its custody entries:
 *     entryHash = keccak256(abi.encode(previousHead, action, actor, counterparty, timestamp, noteHash))
 *  so a reader can recompute the chain from the entries and compare it with the stored head. Evidence and custody
 *  entries are append-only: there is no function that edits or deletes them.
 */
contract EvidenceLocker is AccessControlDefaultAdminRules, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

    // ---------------------------------------------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------------------------------------------

    bytes32 public constant INVESTIGATOR_ROLE = keccak256("INVESTIGATOR_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // ---------------------------------------------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------------------------------------------

    enum CustodyAction {
        Submitted, // first entry, written by registerEvidence
        Accessed, // an investigator opened or copied the evidence
        Transferred, // custody moved to another investigator
        VerifiedMatch, // a re-computed SHA-256 matched the registered one
        VerifiedMismatch, // a re-computed SHA-256 did NOT match: possible alteration
        Reassigned // admin moved custody because the custodian could not (role revoked, key lost)
    }

    struct Evidence {
        bytes32 caseRef; // opaque, salted hash of the case identifier (never a plaintext case number)
        bytes32 sha256Hash; // SHA-256 of the original evidence bytes
        string cid; // content identifier of the stored copy (should point to ENCRYPTED content)
        address submitter;
        address custodian;
        uint64 submittedAt;
        uint32 custodyCount;
        bytes32 custodyHead; // head of the custody hash chain
    }

    struct CustodyEntry {
        CustodyAction action;
        address actor;
        address counterparty; // new custodian for Transferred / Reassigned, otherwise address(0)
        uint64 timestamp;
        bytes32 noteHash; // hash of an off-chain note; bytes32(0) if none
    }

    // ---------------------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------------------

    /// @dev Upper bound for a CID string (CIDv0 is 46 chars, typical CIDv1 59-63); keeps storage costs bounded.
    uint256 public constant MAX_CID_LENGTH = 128;

    uint256 private _lastId;
    mapping(uint256 id => Evidence) private _evidence;
    mapping(uint256 id => CustodyEntry[]) private _custody;
    /// @dev keccak256(caseRef, sha256Hash) => id, to reject registering the same bytes twice under one case.
    mapping(bytes32 key => uint256 id) private _idByKey;
    /// @dev Members of the two working roles, so the admin UI can list authorised addresses without scanning logs.
    mapping(bytes32 role => EnumerableSet.AddressSet) private _members;

    // ---------------------------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------------------------

    event EvidenceRegistered(
        uint256 indexed id,
        bytes32 indexed caseRef,
        address indexed submitter,
        bytes32 sha256Hash,
        string cid,
        uint64 timestamp
    );

    event CustodyRecorded(
        uint256 indexed id,
        uint32 index,
        CustodyAction indexed action,
        address indexed actor,
        address counterparty,
        bytes32 noteHash,
        bytes32 entryHash,
        uint64 timestamp
    );

    // ---------------------------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------------------------

    error ZeroValue();
    error InvalidCid();
    error DuplicateEvidence(uint256 existingId);
    error UnknownEvidence(uint256 id);
    error NotCustodian(address custodian);
    error InvalidRecipient(address recipient);

    // ---------------------------------------------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------------------------------------------

    /**
     * @param initialAdminDelay Seconds an admin transfer must wait between being proposed and accepted
     *        (for example 3 days in production).
     * @param initialAdmin The first admin ("Chief"). Use a multisig for anything but local testing.
     */
    constructor(uint48 initialAdminDelay, address initialAdmin)
        AccessControlDefaultAdminRules(initialAdminDelay, initialAdmin)
    {}

    // ---------------------------------------------------------------------------------------------------------
    // Investigator actions (all revert while paused)
    // ---------------------------------------------------------------------------------------------------------

    /**
     * @notice Registers a piece of evidence and opens its chain of custody. The caller becomes submitter and
     *         first custodian.
     * @param caseRef Opaque case reference (salted hash of the case number, computed off-chain).
     * @param sha256Hash SHA-256 of the original evidence bytes.
     * @param cid Content identifier of the stored copy.
     * @return id The new evidence id (starts at 1).
     */
    function registerEvidence(bytes32 caseRef, bytes32 sha256Hash, string calldata cid)
        external
        onlyRole(INVESTIGATOR_ROLE)
        whenNotPaused
        returns (uint256 id)
    {
        if (caseRef == bytes32(0) || sha256Hash == bytes32(0)) revert ZeroValue();
        uint256 cidLength = bytes(cid).length;
        if (cidLength == 0 || cidLength > MAX_CID_LENGTH) revert InvalidCid();

        bytes32 key = keccak256(abi.encode(caseRef, sha256Hash));
        uint256 existing = _idByKey[key];
        if (existing != 0) revert DuplicateEvidence(existing);

        id = ++_lastId;
        _idByKey[key] = id;

        Evidence storage ev = _evidence[id];
        ev.caseRef = caseRef;
        ev.sha256Hash = sha256Hash;
        ev.cid = cid;
        ev.submitter = msg.sender;
        ev.custodian = msg.sender;
        ev.submittedAt = uint64(block.timestamp);

        emit EvidenceRegistered(id, caseRef, msg.sender, sha256Hash, cid, uint64(block.timestamp));
        _appendCustody(id, ev, CustodyAction.Submitted, msg.sender, address(0), bytes32(0));
    }

    /// @notice Records that the caller accessed the evidence (the access is itself part of the custody trail).
    function logAccess(uint256 id, bytes32 noteHash) external onlyRole(INVESTIGATOR_ROLE) whenNotPaused {
        Evidence storage ev = _existing(id);
        _appendCustody(id, ev, CustodyAction.Accessed, msg.sender, address(0), noteHash);
    }

    /**
     * @notice Records the outcome of re-hashing the evidence. The comparison happens on chain, so the recorded
     *         result cannot be claimed differently from what the supplied hash implies.
     * @param candidateHash SHA-256 the investigator computed from the file in hand.
     */
    function logVerification(uint256 id, bytes32 candidateHash, bytes32 noteHash)
        external
        onlyRole(INVESTIGATOR_ROLE)
        whenNotPaused
    {
        Evidence storage ev = _existing(id);
        CustodyAction action =
            candidateHash == ev.sha256Hash ? CustodyAction.VerifiedMatch : CustodyAction.VerifiedMismatch;
        _appendCustody(id, ev, action, msg.sender, address(0), noteHash);
    }

    /**
     * @notice Hands custody to another investigator. Only the current custodian may do this, and only while
     *         still holding the investigator role.
     */
    function transferCustody(uint256 id, address to, bytes32 noteHash)
        external
        onlyRole(INVESTIGATOR_ROLE)
        whenNotPaused
    {
        Evidence storage ev = _existing(id);
        if (ev.custodian != msg.sender) revert NotCustodian(ev.custodian);
        if (to == address(0) || to == msg.sender || !hasRole(INVESTIGATOR_ROLE, to)) revert InvalidRecipient(to);

        ev.custodian = to;
        _appendCustody(id, ev, CustodyAction.Transferred, msg.sender, to, noteHash);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Admin actions
    // ---------------------------------------------------------------------------------------------------------

    /**
     * @notice Emergency recovery: moves custody when the custodian can no longer act (role revoked, key lost).
     *         The move is recorded as `Reassigned` with the admin as actor, so it is visible to every reader.
     *         Works while paused so an incident can be cleaned up.
     */
    function reassignCustody(uint256 id, address to, bytes32 noteHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Evidence storage ev = _existing(id);
        if (to == address(0) || !hasRole(INVESTIGATOR_ROLE, to)) revert InvalidRecipient(to);

        ev.custodian = to;
        _appendCustody(id, ev, CustodyAction.Reassigned, msg.sender, to, noteHash);
    }

    /// @notice Stops all investigator writes (for example after a suspected key compromise).
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------------------------------------------
    // Reads (open to everyone: see the privacy note above)
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Number of evidence records ever registered. Valid ids are 1..totalEvidence().
    function totalEvidence() external view returns (uint256) {
        return _lastId;
    }

    function getEvidence(uint256 id) external view returns (Evidence memory) {
        _existing(id);
        return _evidence[id];
    }

    function custodyLength(uint256 id) external view returns (uint256) {
        _existing(id);
        return _custody[id].length;
    }

    function getCustodyEntry(uint256 id, uint256 index) external view returns (CustodyEntry memory) {
        _existing(id);
        return _custody[id][index];
    }

    /// @notice Looks up the id registered for (caseRef, sha256Hash); 0 if none.
    function findEvidence(bytes32 caseRef, bytes32 sha256Hash) external view returns (uint256) {
        return _idByKey[keccak256(abi.encode(caseRef, sha256Hash))];
    }

    /// @notice Read-only integrity check an auditor can run without a transaction.
    function verify(uint256 id, bytes32 candidateHash) external view returns (bool) {
        _existing(id);
        return _evidence[id].sha256Hash == candidateHash;
    }

    /// @notice Recomputes the custody hash chain from the stored entries and compares it with the stored head.
    function verifyCustodyChain(uint256 id) external view returns (bool) {
        _existing(id);
        CustodyEntry[] storage entries = _custody[id];
        bytes32 head = bytes32(0);
        for (uint256 i = 0; i < entries.length; i++) {
            CustodyEntry storage e = entries[i];
            head = _entryHash(head, e.action, e.actor, e.counterparty, e.timestamp, e.noteHash);
        }
        return head == _evidence[id].custodyHead;
    }

    /// @notice Addresses currently holding INVESTIGATOR_ROLE or AUDITOR_ROLE. Any other role returns an empty list.
    function getRoleMembers(bytes32 role) external view returns (address[] memory) {
        return _members[role].values();
    }

    /// @notice Which roles an address holds. A single address can hold several (for example admin and investigator).
    function rolesOf(address account) external view returns (bool isAdmin, bool isInvestigator, bool isAuditor) {
        return (hasRole(DEFAULT_ADMIN_ROLE, account), hasRole(INVESTIGATOR_ROLE, account), hasRole(AUDITOR_ROLE, account));
    }

    // ---------------------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------------------

    function _existing(uint256 id) private view returns (Evidence storage ev) {
        ev = _evidence[id];
        if (ev.submitter == address(0)) revert UnknownEvidence(id);
    }

    function _appendCustody(
        uint256 id,
        Evidence storage ev,
        CustodyAction action,
        address actor,
        address counterparty,
        bytes32 noteHash
    ) private {
        uint64 ts = uint64(block.timestamp);
        bytes32 entryHash = _entryHash(ev.custodyHead, action, actor, counterparty, ts, noteHash);
        ev.custodyHead = entryHash;

        uint32 index = ev.custodyCount;
        ev.custodyCount = index + 1;
        _custody[id].push(
            CustodyEntry({action: action, actor: actor, counterparty: counterparty, timestamp: ts, noteHash: noteHash})
        );

        emit CustodyRecorded(id, index, action, actor, counterparty, noteHash, entryHash, ts);
    }

    function _entryHash(
        bytes32 previousHead,
        CustodyAction action,
        address actor,
        address counterparty,
        uint64 timestamp,
        bytes32 noteHash
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(previousHead, uint8(action), actor, counterparty, timestamp, noteHash));
    }

    // ---------------------------------------------------------------------------------------------------------
    // Member tracking for the two working roles. Every grant and revoke (including renounce) funnels through these
    // two internal hooks, so the lists cannot drift from the real role state.
    // ---------------------------------------------------------------------------------------------------------

    function _grantRole(bytes32 role, address account) internal override returns (bool granted) {
        granted = super._grantRole(role, account);
        if (granted && (role == INVESTIGATOR_ROLE || role == AUDITOR_ROLE)) _members[role].add(account);
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool revoked) {
        revoked = super._revokeRole(role, account);
        if (revoked && (role == INVESTIGATOR_ROLE || role == AUDITOR_ROLE)) _members[role].remove(account);
    }
}
