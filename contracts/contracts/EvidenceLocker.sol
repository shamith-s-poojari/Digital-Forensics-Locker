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
 *  the stored (encrypted) copy, an opaque case id (a salted hash of the case number, computed off-chain; never a
 *  plaintext case number, name or file name) and addresses. Addresses are pseudonymous but linkable to people over
 *  time: for real law-enforcement use deploy on a permissioned or private network, not a public one.
 *
 * Records and the case chain
 *  Each registration writes one immutable Record of exactly 256 bytes (8 storage slots, see `Record`). The records
 *  of one case form a hash chain:
 *     h_0 = SHA256(caseId)
 *     h_i = SHA256(h_{i-1} || e_i || CID_i || W_i || T_i)
 *  where e_i is the evidence SHA-256, CID_i the content identifier, W_i the registering officer's address and T_i
 *  the block timestamp (never a client-supplied time), packed without padding (`abi.encodePacked`). h_i is stored
 *  in the record as `link`. Anyone can walk a case's records in order, recompute every link and stop at the first
 *  mismatch (`verifyCaseChain` does it on chain; the web app does it independently).
 *
 * Case-details anchoring
 *  Titles and descriptions live off chain (they are sensitive). Each registration also stores `caseDigest`: the
 *  digest of the case's descriptive fields at that moment, salted off chain (see src/cases/caseDigest.js). It is
 *  kept beside the Record, not in it, so the Record stays at 256 bytes and the link formula is unchanged. Anyone
 *  holding the off-chain case history can show which version each record anchored; an off-chain edit that no
 *  record anchored, or a rewritten history, is detectable.
 *
 * Custody trail
 *  Each evidence item also carries a hash chain over its custody actions (access, transfer, verification):
 *     entryHash = keccak256(abi.encode(previousHead, action, actor, counterparty, timestamp, noteHash))
 *  Records and custody entries are append-only: no function edits or deletes them.
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

    /**
     * @dev The immutable registration record. Strict 256-byte layout, 8 storage slots of 32 bytes:
     *        slot 0     evidenceHash
     *        slot 1     cid (string header: length)
     *        slot 2     officer (address, left-padded; never packed with a neighbour)
     *        slot 3     timestamp
     *        slot 4     caseId
     *        slot 5     link
     *        slot 6, 7  cid bytes, at keccak256(slot 1). The CID length is held to 33..64 bytes, so it always fills
     *                   exactly two data slots (CIDv0 is 46 characters, CIDv1 base32 sha2-256 is 59).
     */
    struct Record {
        bytes32 evidenceHash; // e_i: SHA-256 of the ORIGINAL evidence bytes
        string cid; // CID_i: content identifier of the stored (encrypted) copy
        address officer; // W_i: the investigator who registered it
        uint256 timestamp; // T_i: block.timestamp of the registering transaction
        uint256 caseId; // opaque, salted hash of the case identifier
        bytes32 link; // h_i, see the contract notes
    }

    /// @dev Mutable per-evidence state, kept apart from the immutable Record. One slot plus the custody head.
    struct EvidenceState {
        address custodian;
        uint32 custodyCount;
        uint64 caseIndex; // position of this record in its case chain (0-based)
        bytes32 custodyHead; // head of the custody hash chain
    }

    /// @notice Everything about one evidence item, as returned by getEvidence.
    struct EvidenceView {
        uint256 caseId;
        bytes32 sha256Hash;
        string cid;
        address submitter;
        address custodian;
        uint256 submittedAt;
        uint32 custodyCount;
        bytes32 custodyHead;
        bytes32 link;
        uint64 caseIndex;
        bytes32 caseDigest;
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

    /// @dev CID length bounds that keep every Record at exactly 256 bytes (see `Record`).
    uint256 public constant MIN_CID_LENGTH = 33;
    uint256 public constant MAX_CID_LENGTH = 64;

    uint256 private _lastId;
    mapping(uint256 id => Record) private _records;
    mapping(uint256 id => EvidenceState) private _state;
    mapping(uint256 id => CustodyEntry[]) private _custody;
    /// @dev Digest of the case's descriptive fields anchored by each registration (see the contract notes).
    mapping(uint256 id => bytes32) private _caseDigest;
    /// @dev The evidence ids of each case, in registration order: the case chain.
    mapping(uint256 caseId => uint256[] ids) private _caseRecords;
    /// @dev keccak256(caseId, sha256Hash) => id, to reject registering the same bytes twice under one case.
    mapping(bytes32 key => uint256 id) private _idByKey;
    /// @dev Members of the two working roles, so the admin UI can list authorised addresses without scanning logs.
    mapping(bytes32 role => EnumerableSet.AddressSet) private _members;

    // ---------------------------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------------------------

    /// @notice One per registration. The evidence hash is the first indexed topic, so "where was this file
    ///         registered?" is a single log query (eth_getLogs with topic1 = hash) rather than a full scan.
    event EvidenceRegistered(
        bytes32 indexed sha256Hash,
        uint256 indexed caseId,
        address indexed officer,
        uint256 id,
        uint256 caseIndex,
        string cid,
        uint256 timestamp,
        bytes32 link,
        bytes32 caseDigest
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
     * @notice Registers a piece of evidence: writes its Record, extends the case chain and opens the chain of
     *         custody. The caller becomes the officer of record and the first custodian.
     * @param caseId Opaque case id (salted hash of the case number, computed off-chain).
     * @param sha256Hash SHA-256 of the original evidence bytes.
     * @param cid Content identifier of the stored copy, 33 to 64 bytes.
     * @param caseDigest Digest of the case's descriptive fields (title, description) as they stand now.
     * @return id The new evidence id (starts at 1).
     */
    function registerEvidence(uint256 caseId, bytes32 sha256Hash, string calldata cid, bytes32 caseDigest)
        external
        onlyRole(INVESTIGATOR_ROLE)
        whenNotPaused
        returns (uint256 id)
    {
        if (caseId == 0 || sha256Hash == bytes32(0) || caseDigest == bytes32(0)) revert ZeroValue();
        uint256 cidLength = bytes(cid).length;
        if (cidLength < MIN_CID_LENGTH || cidLength > MAX_CID_LENGTH) revert InvalidCid();

        bytes32 key = keccak256(abi.encode(caseId, sha256Hash));
        uint256 existing = _idByKey[key];
        if (existing != 0) revert DuplicateEvidence(existing);

        id = ++_lastId;
        _idByKey[key] = id;

        _writeRecord(id, caseId, sha256Hash, cid);
        _caseDigest[id] = caseDigest;
        _emitRegistered(id, cid);
        _appendCustody(id, _state[id], CustodyAction.Submitted, msg.sender, address(0), bytes32(0));
    }

    /// @notice Records that the caller accessed the evidence (the access is itself part of the custody trail).
    function logAccess(uint256 id, bytes32 noteHash) external onlyRole(INVESTIGATOR_ROLE) whenNotPaused {
        EvidenceState storage st = _existing(id);
        _appendCustody(id, st, CustodyAction.Accessed, msg.sender, address(0), noteHash);
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
        EvidenceState storage st = _existing(id);
        CustodyAction action =
            candidateHash == _records[id].evidenceHash ? CustodyAction.VerifiedMatch : CustodyAction.VerifiedMismatch;
        _appendCustody(id, st, action, msg.sender, address(0), noteHash);
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
        EvidenceState storage st = _existing(id);
        if (st.custodian != msg.sender) revert NotCustodian(st.custodian);
        if (to == address(0) || to == msg.sender || !hasRole(INVESTIGATOR_ROLE, to)) revert InvalidRecipient(to);

        st.custodian = to;
        _appendCustody(id, st, CustodyAction.Transferred, msg.sender, to, noteHash);
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
        EvidenceState storage st = _existing(id);
        if (to == address(0) || !hasRole(INVESTIGATOR_ROLE, to)) revert InvalidRecipient(to);

        st.custodian = to;
        _appendCustody(id, st, CustodyAction.Reassigned, msg.sender, to, noteHash);
    }

    /// @notice Stops all investigator writes (for example after a suspected key compromise).
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------------------------------------------
    // The case chain (pure helpers, so off-chain verifiers can check their own implementation against these)
    // ---------------------------------------------------------------------------------------------------------

    /// @notice h_0 for a case: SHA256 of the case id as 32 big-endian bytes. Binds the chain to its case, so the
    ///         records of one case cannot be presented as another case's chain.
    function caseGenesis(uint256 caseId) public pure returns (bytes32) {
        return sha256(abi.encodePacked(caseId));
    }

    /// @notice h_i = SHA256(h_{i-1} || e_i || CID_i || W_i || T_i). The CID is the only variable-length field and
    ///         sits between fixed-length ones, so the packed encoding is unambiguous.
    function computeLink(bytes32 previousLink, bytes32 evidenceHash, string memory cid, address officer, uint256 timestamp)
        public
        pure
        returns (bytes32)
    {
        return sha256(abi.encodePacked(previousLink, evidenceHash, cid, officer, timestamp));
    }

    // ---------------------------------------------------------------------------------------------------------
    // Reads (open to everyone: see the privacy note above)
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Number of evidence records ever registered. Valid ids are 1..totalEvidence().
    function totalEvidence() external view returns (uint256) {
        return _lastId;
    }

    function getEvidence(uint256 id) external view returns (EvidenceView memory) {
        EvidenceState storage st = _existing(id);
        Record storage r = _records[id];
        return EvidenceView({
            caseId: r.caseId,
            sha256Hash: r.evidenceHash,
            cid: r.cid,
            submitter: r.officer,
            custodian: st.custodian,
            submittedAt: r.timestamp,
            custodyCount: st.custodyCount,
            custodyHead: st.custodyHead,
            link: r.link,
            caseIndex: st.caseIndex,
            caseDigest: _caseDigest[id]
        });
    }

    /// @notice The immutable 256-byte registration record.
    function getRecord(uint256 id) external view returns (Record memory) {
        _existing(id);
        return _records[id];
    }

    /// @notice Number of records in a case chain.
    function caseRecordCount(uint256 caseId) external view returns (uint256) {
        return _caseRecords[caseId].length;
    }

    /// @notice Evidence id at `index` (0-based, registration order) in a case chain.
    function caseRecordId(uint256 caseId, uint256 index) external view returns (uint256) {
        return _caseRecords[caseId][index];
    }

    /// @notice The latest link of a case chain (its genesis value if the case has no records yet).
    function caseHead(uint256 caseId) external view returns (bytes32) {
        uint256[] storage chain = _caseRecords[caseId];
        return chain.length == 0 ? caseGenesis(caseId) : _records[chain[chain.length - 1]].link;
    }

    /**
     * @notice Walks a case chain in order, recomputing every link from the record's fields and the previous link.
     * @return ok True when every link matches.
     * @return firstBadIndex Index of the first mismatching record, or type(uint256).max when `ok`.
     * @dev A view over every record of the case: call it off chain (eth_call), not from another contract.
     */
    function verifyCaseChain(uint256 caseId) external view returns (bool ok, uint256 firstBadIndex) {
        uint256[] storage chain = _caseRecords[caseId];
        bytes32 previous = caseGenesis(caseId);
        for (uint256 i = 0; i < chain.length; i++) {
            Record storage r = _records[chain[i]];
            bytes32 expected = computeLink(previous, r.evidenceHash, r.cid, r.officer, r.timestamp);
            if (r.caseId != caseId || expected != r.link) return (false, i);
            previous = expected;
        }
        return (true, type(uint256).max);
    }

    function custodyLength(uint256 id) external view returns (uint256) {
        _existing(id);
        return _custody[id].length;
    }

    function getCustodyEntry(uint256 id, uint256 index) external view returns (CustodyEntry memory) {
        _existing(id);
        return _custody[id][index];
    }

    /// @notice Looks up the id registered for (caseId, sha256Hash); 0 if none.
    function findEvidence(uint256 caseId, bytes32 sha256Hash) external view returns (uint256) {
        return _idByKey[keccak256(abi.encode(caseId, sha256Hash))];
    }

    /// @notice Read-only integrity check an auditor can run without a transaction.
    function verify(uint256 id, bytes32 candidateHash) external view returns (bool) {
        _existing(id);
        return _records[id].evidenceHash == candidateHash;
    }

    /// @notice Recomputes the custody hash chain from the stored entries and compares it with the stored head.
    function verifyCustodyChain(uint256 id) external view returns (bool) {
        EvidenceState storage st = _existing(id);
        CustodyEntry[] storage entries = _custody[id];
        bytes32 head = bytes32(0);
        for (uint256 i = 0; i < entries.length; i++) {
            CustodyEntry storage e = entries[i];
            head = _entryHash(head, e.action, e.actor, e.counterparty, e.timestamp, e.noteHash);
        }
        return head == st.custodyHead;
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

    /// @dev Writes the Record for a new id, links it to the end of its case chain, and opens its mutable state.
    function _writeRecord(uint256 id, uint256 caseId, bytes32 sha256Hash, string calldata cid)
        private
        returns (Record storage r)
    {
        uint256[] storage chain = _caseRecords[caseId];
        uint256 caseIndex = chain.length;
        bytes32 previous = caseIndex == 0 ? caseGenesis(caseId) : _records[chain[caseIndex - 1]].link;

        r = _records[id];
        r.evidenceHash = sha256Hash;
        r.cid = cid;
        r.officer = msg.sender;
        // The time comes from the block, never from the caller, so a record cannot be backdated.
        r.timestamp = block.timestamp;
        r.caseId = caseId;
        r.link = computeLink(previous, sha256Hash, cid, msg.sender, block.timestamp);
        chain.push(id);

        EvidenceState storage st = _state[id];
        st.custodian = msg.sender;
        st.caseIndex = uint64(caseIndex);
    }

    /// @dev Separate from registerEvidence only to keep that function's stack shallow.
    function _emitRegistered(uint256 id, string calldata cid) private {
        Record storage r = _records[id];
        emit EvidenceRegistered(
            r.evidenceHash, r.caseId, r.officer, id, _state[id].caseIndex, cid, r.timestamp, r.link, _caseDigest[id]
        );
    }

    function _existing(uint256 id) private view returns (EvidenceState storage st) {
        if (_records[id].officer == address(0)) revert UnknownEvidence(id);
        st = _state[id];
    }

    function _appendCustody(
        uint256 id,
        EvidenceState storage st,
        CustodyAction action,
        address actor,
        address counterparty,
        bytes32 noteHash
    ) private {
        uint64 ts = uint64(block.timestamp);
        bytes32 entryHash = _entryHash(st.custodyHead, action, actor, counterparty, ts, noteHash);
        st.custodyHead = entryHash;

        uint32 index = st.custodyCount;
        st.custodyCount = index + 1;
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
