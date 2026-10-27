import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const ADMIN_DELAY = 3 * 24 * 60 * 60; // 3 days
const ZERO32 = ethers.ZeroHash;
const CASE_A = ethers.id("case-A:salt");
const CASE_B = ethers.id("case-B:salt");
const HASH_1 = ethers.sha256(ethers.toUtf8Bytes("evidence file one"));
const HASH_2 = ethers.sha256(ethers.toUtf8Bytes("evidence file two"));
const CID_1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const NOTE = ethers.id("note: chain sealed bag 7");
const DIGEST = ethers.sha256(ethers.toUtf8Bytes("case details v1"));
const DIGEST_2 = ethers.sha256(ethers.toUtf8Bytes("case details v2"));

// CustodyAction enum, same order as the contract.
const Action = { Submitted: 0, Accessed: 1, Transferred: 2, VerifiedMatch: 3, VerifiedMismatch: 4, Reassigned: 5 } as const;

async function deploy() {
  const [chief, alice, bob, carol, dave, eve] = await ethers.getSigners();
  const locker = await ethers.deployContract("EvidenceLocker", [ADMIN_DELAY, chief.address]);
  const INVESTIGATOR = await locker.INVESTIGATOR_ROLE();
  const AUDITOR = await locker.AUDITOR_ROLE();
  const ADMIN = await locker.DEFAULT_ADMIN_ROLE();
  await locker.connect(chief).grantRole(INVESTIGATOR, alice.address);
  await locker.connect(chief).grantRole(INVESTIGATOR, bob.address);
  await locker.connect(chief).grantRole(AUDITOR, carol.address);
  return { locker, chief, alice, bob, carol, dave, eve, INVESTIGATOR, AUDITOR, ADMIN };
}

async function withEvidence() {
  const ctx = await deploy();
  await ctx.locker.connect(ctx.alice).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST);
  return ctx;
}

describe("EvidenceLocker", () => {
  describe("roles", () => {
    it("makes the constructor argument the admin and nobody else anything", async () => {
      const { locker, chief, alice, dave } = await deploy();
      expect(await locker.rolesOf(chief.address)).to.deep.equal([true, false, false]);
      expect(await locker.rolesOf(alice.address)).to.deep.equal([false, true, false]);
      expect(await locker.rolesOf(dave.address)).to.deep.equal([false, false, false]);
      expect(await locker.defaultAdmin()).to.equal(chief.address);
    });

    it("reports a holder of several roles correctly", async () => {
      const { locker, chief, alice, AUDITOR } = await deploy();
      await locker.connect(chief).grantRole(AUDITOR, alice.address);
      expect(await locker.rolesOf(alice.address)).to.deep.equal([false, true, true]);
    });

    it("lists role members and keeps the list in step with grants, revokes and renounces", async () => {
      const { locker, chief, alice, bob, carol, dave, INVESTIGATOR, AUDITOR } = await deploy();
      expect(await locker.getRoleMembers(INVESTIGATOR)).to.have.members([alice.address, bob.address]);
      expect(await locker.getRoleMembers(AUDITOR)).to.have.members([carol.address]);

      await locker.connect(chief).revokeRole(INVESTIGATOR, bob.address);
      expect(await locker.getRoleMembers(INVESTIGATOR)).to.have.members([alice.address]);

      await locker.connect(carol).renounceRole(AUDITOR, carol.address);
      expect(await locker.getRoleMembers(AUDITOR)).to.have.lengthOf(0);

      await locker.connect(chief).grantRole(AUDITOR, dave.address);
      await locker.connect(chief).grantRole(AUDITOR, dave.address); // granting twice must not duplicate
      expect(await locker.getRoleMembers(AUDITOR)).to.deep.equal([dave.address]);
    });

    it("returns an empty member list for the admin role and unknown roles", async () => {
      const { locker, ADMIN } = await deploy();
      expect(await locker.getRoleMembers(ADMIN)).to.have.lengthOf(0);
      expect(await locker.getRoleMembers(ethers.id("SOMETHING_ELSE"))).to.have.lengthOf(0);
    });

    it("lets only the admin grant or revoke roles", async () => {
      const { locker, alice, dave, INVESTIGATOR, AUDITOR } = await deploy();
      await expect(locker.connect(alice).grantRole(AUDITOR, dave.address))
        .to.be.revertedWithCustomError(locker, "AccessControlUnauthorizedAccount")
        .withArgs(alice.address, ethers.ZeroHash);
      await expect(locker.connect(dave).revokeRole(INVESTIGATOR, alice.address)).to.be.revertedWithCustomError(
        locker,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("does not let the admin role be handed out with grantRole (only the delayed two-step transfer)", async () => {
      const { locker, chief, dave, ADMIN } = await deploy();
      await expect(locker.connect(chief).grantRole(ADMIN, dave.address)).to.be.revertedWithCustomError(
        locker,
        "AccessControlEnforcedDefaultAdminRules"
      );
    });

    it("enforces the admin-transfer delay, then moves the admin role", async () => {
      const { locker, chief, dave } = await deploy();
      await locker.connect(chief).beginDefaultAdminTransfer(dave.address);

      await expect(locker.connect(dave).acceptDefaultAdminTransfer()).to.be.revertedWithCustomError(
        locker,
        "AccessControlEnforcedDefaultAdminDelay"
      );

      await networkHelpers.time.increase(ADMIN_DELAY + 1);
      await locker.connect(dave).acceptDefaultAdminTransfer();

      expect(await locker.defaultAdmin()).to.equal(dave.address);
      expect((await locker.rolesOf(chief.address))[0]).to.equal(false);
      expect((await locker.rolesOf(dave.address))[0]).to.equal(true);
    });
  });

  describe("registerEvidence", () => {
    it("registers evidence, makes the caller submitter and custodian, and opens the custody trail", async () => {
      const { locker, alice } = await deploy();

      const tx = await locker.connect(alice).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST);
      await expect(tx).to.emit(locker, "EvidenceRegistered").withArgs(HASH_1, BigInt(CASE_A), alice.address, 1n, 0n, CID_1, anyUint, anyBytes32, DIGEST);
      await expect(tx).to.emit(locker, "CustodyRecorded");

      const ev = await locker.getEvidence(1);
      expect(ev.caseId).to.equal(BigInt(CASE_A));
      expect(ev.caseDigest).to.equal(DIGEST);
      expect(ev.sha256Hash).to.equal(HASH_1);
      expect(ev.cid).to.equal(CID_1);
      expect(ev.submitter).to.equal(alice.address);
      expect(ev.custodian).to.equal(alice.address);
      expect(ev.custodyCount).to.equal(1n);
      expect(await locker.totalEvidence()).to.equal(1n);

      const entry = await locker.getCustodyEntry(1, 0);
      expect(entry.action).to.equal(BigInt(Action.Submitted));
      expect(entry.actor).to.equal(alice.address);
    });

    it("assigns increasing ids", async () => {
      const { locker, alice } = await deploy();
      await locker.connect(alice).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST);
      await locker.connect(alice).registerEvidence(CASE_A, HASH_2, CID_1, DIGEST);
      expect(await locker.totalEvidence()).to.equal(2n);
      expect((await locker.getEvidence(2)).sha256Hash).to.equal(HASH_2);
    });

    it("rejects every caller who is not an investigator, including the admin and auditors", async () => {
      const { locker, chief, carol, dave } = await deploy();
      for (const who of [chief, carol, dave]) {
        await expect(locker.connect(who).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST)).to.be.revertedWithCustomError(
          locker,
          "AccessControlUnauthorizedAccount"
        );
      }
      expect(await locker.totalEvidence()).to.equal(0n);
    });

    it("lets the admin register evidence only after also being made an investigator", async () => {
      const { locker, chief, INVESTIGATOR } = await deploy();
      await locker.connect(chief).grantRole(INVESTIGATOR, chief.address);
      await expect(locker.connect(chief).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST)).to.emit(locker, "EvidenceRegistered");
    });

    it("anchors the case-details digest given with each record, which can differ from record to record", async () => {
      const { locker, alice } = await deploy();
      await locker.connect(alice).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST);
      await expect(locker.connect(alice).registerEvidence(CASE_A, HASH_2, CID_1, DIGEST_2))
        .to.emit(locker, "EvidenceRegistered")
        .withArgs(HASH_2, BigInt(CASE_A), alice.address, 2n, 1n, CID_1, anyUint, anyBytes32, DIGEST_2);
      expect((await locker.getEvidence(1)).caseDigest).to.equal(DIGEST);
      expect((await locker.getEvidence(2)).caseDigest).to.equal(DIGEST_2);
    });

    it("rejects a missing case-details digest", async () => {
      const { locker, alice } = await deploy();
      await expect(locker.connect(alice).registerEvidence(CASE_A, HASH_1, CID_1, ZERO32)).to.be.revertedWithCustomError(locker, "ZeroValue");
    });

    it("rejects zero case references and zero hashes", async () => {
      const { locker, alice } = await deploy();
      await expect(locker.connect(alice).registerEvidence(ZERO32, HASH_1, CID_1, DIGEST)).to.be.revertedWithCustomError(locker, "ZeroValue");
      await expect(locker.connect(alice).registerEvidence(CASE_A, ZERO32, CID_1, DIGEST)).to.be.revertedWithCustomError(locker, "ZeroValue");
    });

    it("holds CIDs to 33..64 bytes (the bounds that keep a record at 256 bytes), inclusive", async () => {
      const { locker, alice } = await deploy();
      for (const bad of ["", "x".repeat(32), "x".repeat(65)]) {
        await expect(locker.connect(alice).registerEvidence(CASE_A, HASH_1, bad, DIGEST)).to.be.revertedWithCustomError(locker, "InvalidCid");
      }
      await expect(locker.connect(alice).registerEvidence(CASE_A, HASH_1, "x".repeat(33), DIGEST)).to.emit(locker, "EvidenceRegistered");
      await expect(locker.connect(alice).registerEvidence(CASE_A, HASH_2, "x".repeat(64), DIGEST)).to.emit(locker, "EvidenceRegistered");
      // Real CIDs: v0 (46 characters) and v1 base32 (59).
      await expect(locker.connect(alice).registerEvidence(CASE_B, HASH_1, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco", DIGEST)).to.emit(
        locker,
        "EvidenceRegistered"
      );
    });

    it("rejects the same bytes twice under one case, but allows them under another case", async () => {
      const { locker, alice, bob } = await deploy();
      await locker.connect(alice).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST);
      await expect(locker.connect(bob).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST))
        .to.be.revertedWithCustomError(locker, "DuplicateEvidence")
        .withArgs(1n);
      await expect(locker.connect(bob).registerEvidence(CASE_B, HASH_1, CID_1, DIGEST)).to.emit(locker, "EvidenceRegistered");
    });

    it("finds evidence by (case, hash)", async () => {
      const { locker } = await withEvidence();
      expect(await locker.findEvidence(CASE_A, HASH_1)).to.equal(1n);
      expect(await locker.findEvidence(CASE_B, HASH_1)).to.equal(0n);
    });

    it("reverts for ids that do not exist", async () => {
      const { locker } = await deploy();
      for (const id of [0, 1, 99]) {
        await expect(locker.getEvidence(id)).to.be.revertedWithCustomError(locker, "UnknownEvidence").withArgs(id);
      }
      await expect(locker.custodyLength(1)).to.be.revertedWithCustomError(locker, "UnknownEvidence");
      await expect(locker.verify(1, HASH_1)).to.be.revertedWithCustomError(locker, "UnknownEvidence");
    });
  });

  describe("access and verification logging", () => {
    it("lets any investigator log access, and records who did it", async () => {
      const { locker, bob } = await withEvidence();
      await expect(locker.connect(bob).logAccess(1, NOTE)).to.emit(locker, "CustodyRecorded");
      const entry = await locker.getCustodyEntry(1, 1);
      expect(entry.action).to.equal(BigInt(Action.Accessed));
      expect(entry.actor).to.equal(bob.address);
      expect(entry.noteHash).to.equal(NOTE);
      expect(await locker.custodyLength(1)).to.equal(2n);
    });

    it("forbids auditors, outsiders and the bare admin from writing custody entries", async () => {
      const { locker, chief, carol, dave } = await withEvidence();
      for (const who of [chief, carol, dave]) {
        await expect(locker.connect(who).logAccess(1, NOTE)).to.be.revertedWithCustomError(locker, "AccessControlUnauthorizedAccount");
        await expect(locker.connect(who).logVerification(1, HASH_1, NOTE)).to.be.revertedWithCustomError(
          locker,
          "AccessControlUnauthorizedAccount"
        );
      }
    });

    it("records a match or a mismatch based on the supplied hash, decided on chain", async () => {
      const { locker, bob } = await withEvidence();
      await locker.connect(bob).logVerification(1, HASH_1, ZERO32);
      await locker.connect(bob).logVerification(1, HASH_2, ZERO32);
      expect((await locker.getCustodyEntry(1, 1)).action).to.equal(BigInt(Action.VerifiedMatch));
      expect((await locker.getCustodyEntry(1, 2)).action).to.equal(BigInt(Action.VerifiedMismatch));
    });

    it("lets anyone run the read-only verify check", async () => {
      const { locker, dave } = await withEvidence();
      expect(await locker.connect(dave).verify(1, HASH_1)).to.equal(true);
      expect(await locker.connect(dave).verify(1, HASH_2)).to.equal(false);
    });
  });

  describe("transferCustody", () => {
    it("moves custody from the current custodian to another investigator and logs it", async () => {
      const { locker, alice, bob } = await withEvidence();
      await expect(locker.connect(alice).transferCustody(1, bob.address, NOTE)).to.emit(locker, "CustodyRecorded");
      expect((await locker.getEvidence(1)).custodian).to.equal(bob.address);
      const entry = await locker.getCustodyEntry(1, 1);
      expect(entry.action).to.equal(BigInt(Action.Transferred));
      expect(entry.actor).to.equal(alice.address);
      expect(entry.counterparty).to.equal(bob.address);
    });

    it("refuses anyone but the current custodian, even another investigator", async () => {
      const { locker, alice, bob } = await withEvidence();
      await expect(locker.connect(bob).transferCustody(1, alice.address, NOTE))
        .to.be.revertedWithCustomError(locker, "NotCustodian")
        .withArgs(alice.address);
    });

    it("refuses recipients who are not investigators, the zero address, and yourself", async () => {
      const { locker, alice, carol, dave } = await withEvidence();
      for (const bad of [carol.address, dave.address, ethers.ZeroAddress, alice.address]) {
        await expect(locker.connect(alice).transferCustody(1, bad, NOTE)).to.be.revertedWithCustomError(locker, "InvalidRecipient");
      }
    });

    it("hands the right to transfer to the new custodian and takes it from the old one", async () => {
      const { locker, alice, bob } = await withEvidence();
      await locker.connect(alice).transferCustody(1, bob.address, NOTE);
      await expect(locker.connect(alice).transferCustody(1, bob.address, NOTE)).to.be.revertedWithCustomError(locker, "NotCustodian");
      await expect(locker.connect(bob).transferCustody(1, alice.address, NOTE)).to.emit(locker, "CustodyRecorded");
    });

    it("blocks a custodian whose investigator role was revoked", async () => {
      const { locker, chief, alice, bob, INVESTIGATOR } = await withEvidence();
      await locker.connect(chief).revokeRole(INVESTIGATOR, alice.address);
      await expect(locker.connect(alice).transferCustody(1, bob.address, NOTE)).to.be.revertedWithCustomError(
        locker,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("reassignCustody (admin recovery)", () => {
    it("lets the admin reassign stranded custody to an investigator and logs the admin as actor", async () => {
      const { locker, chief, alice, bob, INVESTIGATOR } = await withEvidence();
      await locker.connect(chief).revokeRole(INVESTIGATOR, alice.address);

      await locker.connect(chief).reassignCustody(1, bob.address, NOTE);

      expect((await locker.getEvidence(1)).custodian).to.equal(bob.address);
      const entry = await locker.getCustodyEntry(1, 1);
      expect(entry.action).to.equal(BigInt(Action.Reassigned));
      expect(entry.actor).to.equal(chief.address);
      expect(entry.counterparty).to.equal(bob.address);
      expect(await locker.verifyCustodyChain(1)).to.equal(true);
    });

    it("is admin-only and only to investigators", async () => {
      const { locker, alice, bob, carol, chief } = await withEvidence();
      await expect(locker.connect(alice).reassignCustody(1, bob.address, NOTE)).to.be.revertedWithCustomError(
        locker,
        "AccessControlUnauthorizedAccount"
      );
      await expect(locker.connect(chief).reassignCustody(1, carol.address, NOTE)).to.be.revertedWithCustomError(locker, "InvalidRecipient");
      await expect(locker.connect(chief).reassignCustody(1, ethers.ZeroAddress, NOTE)).to.be.revertedWithCustomError(
        locker,
        "InvalidRecipient"
      );
    });
  });

  describe("pause", () => {
    it("stops every investigator write while paused, and resumes after unpause", async () => {
      const { locker, chief, alice, bob } = await withEvidence();
      await locker.connect(chief).pause();

      await expect(locker.connect(alice).registerEvidence(CASE_B, HASH_2, CID_1, DIGEST)).to.be.revertedWithCustomError(locker, "EnforcedPause");
      await expect(locker.connect(alice).logAccess(1, NOTE)).to.be.revertedWithCustomError(locker, "EnforcedPause");
      await expect(locker.connect(alice).logVerification(1, HASH_1, NOTE)).to.be.revertedWithCustomError(locker, "EnforcedPause");
      await expect(locker.connect(alice).transferCustody(1, bob.address, NOTE)).to.be.revertedWithCustomError(locker, "EnforcedPause");

      // Reads and admin recovery keep working while paused.
      expect(await locker.verify(1, HASH_1)).to.equal(true);
      await locker.connect(chief).reassignCustody(1, bob.address, NOTE);

      await locker.connect(chief).unpause();
      await expect(locker.connect(bob).logAccess(1, NOTE)).to.emit(locker, "CustodyRecorded");
    });

    it("lets only the admin pause or unpause", async () => {
      const { locker, alice, chief } = await deploy();
      await expect(locker.connect(alice).pause()).to.be.revertedWithCustomError(locker, "AccessControlUnauthorizedAccount");
      await locker.connect(chief).pause();
      await expect(locker.connect(alice).unpause()).to.be.revertedWithCustomError(locker, "AccessControlUnauthorizedAccount");
    });
  });

  describe("custody hash chain", () => {
    /** Independent re-implementation of the contract's entry hash, to check the contract against something other than itself. */
    function entryHash(prev: string, action: number, actor: string, counterparty: string, timestamp: bigint, noteHash: string) {
      return ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint8", "address", "address", "uint64", "bytes32"],
          [prev, action, actor, counterparty, timestamp, noteHash]
        )
      );
    }

    it("matches an independent recomputation from the stored entries and from the emitted events", async () => {
      const { locker, alice, bob, chief, INVESTIGATOR } = await withEvidence();
      await locker.connect(bob).logAccess(1, NOTE);
      await locker.connect(bob).logVerification(1, HASH_2, ZERO32);
      await locker.connect(alice).transferCustody(1, bob.address, NOTE);
      await locker.connect(chief).revokeRole(INVESTIGATOR, bob.address);
      await locker.connect(chief).grantRole(INVESTIGATOR, bob.address);
      await locker.connect(chief).reassignCustody(1, alice.address, NOTE);

      const length = Number(await locker.custodyLength(1));
      expect(length).to.equal(5);

      let head = ZERO32;
      const emitted = await locker.queryFilter(locker.filters.CustodyRecorded(1n));
      for (let i = 0; i < length; i++) {
        const e = await locker.getCustodyEntry(1, i);
        head = entryHash(head, Number(e.action), e.actor, e.counterparty, e.timestamp, e.noteHash);
        expect(emitted[i].args.entryHash).to.equal(head);
        expect(emitted[i].args.index).to.equal(BigInt(i));
      }
      expect((await locker.getEvidence(1)).custodyHead).to.equal(head);
      expect(await locker.verifyCustodyChain(1)).to.equal(true);
    });

    it("keeps separate chains for separate evidence", async () => {
      const { locker, alice } = await withEvidence();
      await locker.connect(alice).registerEvidence(CASE_A, HASH_2, CID_1, DIGEST);
      await locker.connect(alice).logAccess(1, NOTE);
      expect(await locker.custodyLength(1)).to.equal(2n);
      expect(await locker.custodyLength(2)).to.equal(1n);
      expect((await locker.getEvidence(1)).custodyHead).to.not.equal((await locker.getEvidence(2)).custodyHead);
    });
  });

  describe("records and the case chain", () => {
    const packed = (types: string[], values: unknown[]) => ethers.solidityPacked(types, values);
    /** Independent implementation of h_0 = SHA256(caseId). */
    const genesis = (caseId: string) => ethers.sha256(packed(["uint256"], [caseId]));
    /** Independent implementation of h_i = SHA256(h_{i-1} || e_i || CID_i || W_i || T_i). */
    const link = (prev: string, e: string, cid: string, officer: string, t: bigint) =>
      ethers.sha256(packed(["bytes32", "bytes32", "string", "address", "uint256"], [prev, e, cid, officer, t]));
    const CID_2 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    const HASH_3 = ethers.sha256(ethers.toUtf8Bytes("evidence file three"));

    it("links each record of a case to the previous one exactly as specified, and keeps cases apart", async () => {
      const { locker, alice, bob } = await deploy();
      await locker.connect(alice).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST); // id 1, case A #0
      await locker.connect(bob).registerEvidence(CASE_B, HASH_1, CID_2, DIGEST); // id 2, case B #0
      await locker.connect(bob).registerEvidence(CASE_A, HASH_2, CID_2, DIGEST); // id 3, case A #1
      await locker.connect(alice).registerEvidence(CASE_A, HASH_3, CID_1, DIGEST); // id 4, case A #2

      let previous = genesis(CASE_A);
      const events = await locker.queryFilter(locker.filters.EvidenceRegistered(undefined, BigInt(CASE_A)));
      expect(events.map((e) => e.args.id)).to.deep.equal([1n, 3n, 4n]);
      for (const [index, id] of [1, 3, 4].entries()) {
        const r = await locker.getRecord(id);
        const expected = link(previous, r.evidenceHash, r.cid, r.officer, r.timestamp);
        expect(r.link).to.equal(expected);
        expect(r.caseId).to.equal(BigInt(CASE_A));
        expect(await locker.caseRecordId(BigInt(CASE_A), index)).to.equal(BigInt(id));
        expect((await locker.getEvidence(id)).caseIndex).to.equal(BigInt(index));
        expect(events[index].args.link).to.equal(expected);
        expect(events[index].args.caseIndex).to.equal(BigInt(index));
        previous = expected;
      }
      expect(await locker.caseRecordCount(BigInt(CASE_A))).to.equal(3n);
      expect(await locker.caseHead(BigInt(CASE_A))).to.equal(previous);

      // Case B has its own chain starting from its own genesis value.
      const b = await locker.getRecord(2);
      expect(b.link).to.equal(link(genesis(CASE_B), HASH_1, CID_2, bob.address, b.timestamp));
      expect(await locker.caseRecordCount(BigInt(CASE_B))).to.equal(1n);

      expect(await locker.verifyCaseChain(BigInt(CASE_A))).to.deep.equal([true, ethers.MaxUint256]);
      expect(await locker.verifyCaseChain(BigInt(CASE_B))).to.deep.equal([true, ethers.MaxUint256]);
    });

    it("exposes the link and genesis functions, which agree with an independent implementation", async () => {
      const { locker, alice } = await deploy();
      expect(await locker.caseGenesis(BigInt(CASE_A))).to.equal(genesis(CASE_A));
      expect(await locker.computeLink(ZERO32, HASH_1, CID_1, alice.address, 1234n)).to.equal(link(ZERO32, HASH_1, CID_1, alice.address, 1234n));
      expect(await locker.caseHead(BigInt(CASE_A))).to.equal(genesis(CASE_A)); // an empty case is at its genesis
      expect(await locker.verifyCaseChain(BigInt(CASE_A))).to.deep.equal([true, ethers.MaxUint256]);
    });

    it("takes the timestamp from the block, not from the caller", async () => {
      const { locker, alice } = await deploy();
      const when = BigInt((await networkHelpers.time.latest()) + 1000);
      await networkHelpers.time.setNextBlockTimestamp(when);
      const tx = await locker.connect(alice).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST);
      const block = await ethers.provider.getBlock((await tx.wait())!.blockNumber);

      expect(BigInt(block!.timestamp)).to.equal(when);
      expect((await locker.getRecord(1)).timestamp).to.equal(when);
      expect((await locker.getEvidence(1)).submittedAt).to.equal(when);
      // There is no timestamp parameter to backdate with.
      expect(locker.interface.getFunction("registerEvidence")!.inputs.map((i) => i.name)).to.deep.equal(["caseId", "sha256Hash", "cid", "caseDigest"]);
    });

    it("indexes the event by evidence hash, so one log query finds every registration of a file", async () => {
      const { locker, alice, bob } = await deploy();
      await locker.connect(alice).registerEvidence(CASE_A, HASH_1, CID_1, DIGEST);
      await locker.connect(alice).registerEvidence(CASE_A, HASH_2, CID_1, DIGEST);
      await locker.connect(bob).registerEvidence(CASE_B, HASH_1, CID_2, DIGEST);

      const hits = await locker.queryFilter(locker.filters.EvidenceRegistered(HASH_1));
      expect(hits.map((h) => h.args.id)).to.deep.equal([1n, 3n]);
      expect(hits[0].topics[1]).to.equal(HASH_1); // topic 0 is the event signature, topic 1 the evidence hash
      expect(hits[1].args.officer).to.equal(bob.address);
    });

    it("stores each record in exactly 8 storage slots (256 bytes) with the specified fields", async () => {
      const { locker, alice } = await withEvidence();
      const address = await locker.getAddress();
      const word = async (slot: bigint) => ethers.provider.getStorage(address, slot);
      const coder = ethers.AbiCoder.defaultAbiCoder();

      // Locate the records mapping: record 1 lives at keccak256(abi.encode(1, mappingSlot)).
      let base = -1n;
      for (let slot = 0n; slot < 32n && base < 0n; slot++) {
        const candidate = BigInt(ethers.keccak256(coder.encode(["uint256", "uint256"], [1n, slot])));
        if ((await word(candidate)) === HASH_1) base = candidate;
      }
      expect(base, "record storage not found").to.not.equal(-1n);

      const record = await locker.getRecord(1);
      const dataSlot = BigInt(ethers.keccak256(ethers.toBeHex(base + 1n, 32)));
      const inline = await Promise.all([0n, 1n, 2n, 3n, 4n, 5n].map((i) => word(base + i)));
      const cidData = await Promise.all([0n, 1n, 2n].map((i) => word(dataSlot + i)));

      expect(inline[0]).to.equal(HASH_1); // evidenceHash
      expect(BigInt(inline[1])).to.equal(BigInt(CID_1.length * 2 + 1)); // long-string header: length * 2 + 1
      expect(inline[2]).to.equal(ethers.zeroPadValue(alice.address, 32).toLowerCase()); // officer, alone in its slot
      expect(BigInt(inline[3])).to.equal(record.timestamp);
      expect(BigInt(inline[4])).to.equal(BigInt(CASE_A));
      expect(inline[5]).to.equal(record.link);
      expect(ethers.toUtf8String(ethers.dataSlice(ethers.concat(cidData.slice(0, 2)), 0, CID_1.length))).to.equal(CID_1);
      expect(cidData[2]).to.equal(ZERO32); // no third CID slot: 6 inline + 2 data = 8 slots = 256 bytes
      expect(await word(base + 6n)).to.equal(ZERO32); // nothing after the 6 inline slots
    });
  });

  describe("state-changing surface (tripwire)", () => {
    it("has exactly the reviewed set of state-changing functions", async () => {
      // If you add a function that changes state, this test fails on purpose: review it for access control and
      // for the append-only rule (evidence and custody entries must never be edited or deleted), then add it here.
      const { locker } = await deploy();
      const writers = locker.interface.fragments
        .filter((f): f is import("ethers").FunctionFragment => f.type === "function")
        .filter((f) => !f.constant) // constant = view or pure
        .map((f) => f.name)
        .sort();

      expect(writers).to.deep.equal(
        [
          // this contract: investigator actions
          "registerEvidence",
          "logAccess",
          "logVerification",
          "transferCustody",
          // this contract: admin actions
          "reassignCustody",
          "pause",
          "unpause",
          // OpenZeppelin AccessControlDefaultAdminRules
          "grantRole",
          "revokeRole",
          "renounceRole",
          "beginDefaultAdminTransfer",
          "cancelDefaultAdminTransfer",
          "acceptDefaultAdminTransfer",
          "changeDefaultAdminDelay",
          "rollbackDefaultAdminDelay",
        ].sort()
      );
    });
  });
});

/** chai matcher helper: accepts any unsigned integer (used for block timestamps we cannot predict). */
function anyUint(value: unknown): boolean {
  return typeof value === "bigint" && value >= 0n;
}

/** chai matcher helper: accepts any 32-byte hex value (used for link values checked separately). */
function anyBytes32(value: unknown): boolean {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
}
