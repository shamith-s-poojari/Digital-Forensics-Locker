import assert from "node:assert/strict";
import { caseGenesis, computeLink } from "./caseChain.js";
import { deriveCaseRef } from "./format.js";
import { LEDGER_ERROR } from "./ledgerErrors.js";

/**
 * Behavioural scenarios every ledger implementation must satisfy. They run against the in-memory demo ledger
 * (src/web3/demoLedger.test.js) AND against the real EvidenceLocker contract on a local Hardhat chain
 * (contracts/test/ethersLedger.test.ts). If the two ever disagree, one of those runs fails.
 *
 * Each scenario receives a fresh context `ctx`:
 *   ctx.as(name)      -> the ledger bound to that actor
 *   ctx.address(name) -> the actor's address
 * Actors: chief (the Chief), alice and bob (Investigators), carol (Auditor), all in branch 1, and dave (no role).
 * Branches 1 and 2 exist from the start.
 */

const HASH_1 = "11".repeat(32);
const HASH_2 = "22".repeat(32);
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const CASE_A = deriveCaseRef("CASE-TEST-A");
const CASE_B = deriveCaseRef("CASE-TEST-B");
const DIGEST = "d1".repeat(32);
const DIGEST_2 = "d2".repeat(32);

/** Sends a write and waits for it to be mined. */
const mine = async (handlePromise) => (await handlePromise).wait();

/** Asserts that a promise rejects with a LedgerError carrying `code`. */
export async function rejectsWith(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code, `expected ${code} but got ${err.code}: ${err.message}`);
    return true;
  });
}

async function registerAs(ctx, who, overrides = {}) {
  const result = await mine(ctx.as(who).registerEvidence({ caseRef: CASE_A, sha256: HASH_1, cid: CID, caseDigest: DIGEST, ...overrides }));
  return result.evidenceId;
}

export const scenarios = [
  {
    name: "registers evidence, opens the custody trail, and the hash chain verifies",
    async run(ctx) {
      const id = await registerAs(ctx, "alice");
      assert.equal(id, 1);

      const list = await ctx.as("carol").listEvidence();
      assert.equal(list.length, 1);
      const ev = list[0];
      assert.equal(ev.id, 1);
      assert.equal(ev.caseRef, CASE_A);
      assert.equal(ev.sha256, HASH_1);
      assert.equal(ev.cid, CID);
      assert.equal(ev.caseDigest, DIGEST);
      assert.equal(ev.submitter, ctx.address("alice"));
      assert.equal(ev.custodian, ctx.address("alice"));
      assert.equal(ev.custody.length, 1);
      assert.equal(ev.custody[0].action, "Submitted");
      assert.equal(ev.custody[0].actor, ctx.address("alice"));
      assert.equal(await ctx.as("carol").verifyChain(1), true);
      assert.equal(await ctx.as("carol").findEvidence(CASE_A, HASH_1), 1);
      assert.equal(await ctx.as("carol").findEvidence(CASE_B, HASH_1), null);
    },
  },
  {
    name: "only investigators can register evidence (not the Chief, auditors or outsiders)",
    async run(ctx) {
      for (const who of ["chief", "carol", "dave"]) {
        await rejectsWith(ctx.as(who).registerEvidence({ caseRef: CASE_A, sha256: HASH_1, cid: CID, caseDigest: DIGEST }), LEDGER_ERROR.NOT_AUTHORIZED);
      }
      assert.equal((await ctx.as("alice").listEvidence()).length, 0);
    },
  },
  {
    name: "rejects the same file twice in one case, but allows it in another case",
    async run(ctx) {
      await registerAs(ctx, "alice");
      await assert.rejects(registerAs(ctx, "bob"), (err) => {
        assert.equal(err.code, LEDGER_ERROR.DUPLICATE);
        assert.equal(err.details.existingId, 1);
        return true;
      });
      assert.equal(await registerAs(ctx, "bob", { caseRef: CASE_B }), 2);
    },
  },
  {
    name: "rejects empty and invalid values",
    async run(ctx) {
      const alice = ctx.as("alice");
      await rejectsWith(alice.registerEvidence({ caseRef: CASE_A, sha256: HASH_1, cid: "", caseDigest: DIGEST }), LEDGER_ERROR.INVALID_INPUT);
      await rejectsWith(alice.registerEvidence({ caseRef: CASE_A, sha256: HASH_1, cid: "x".repeat(32), caseDigest: DIGEST }), LEDGER_ERROR.INVALID_INPUT);
      await rejectsWith(alice.registerEvidence({ caseRef: CASE_A, sha256: HASH_1, cid: "x".repeat(65), caseDigest: DIGEST }), LEDGER_ERROR.INVALID_INPUT);
      await rejectsWith(alice.registerEvidence({ caseRef: `0x${"0".repeat(64)}`, sha256: HASH_1, cid: CID, caseDigest: DIGEST }), LEDGER_ERROR.INVALID_INPUT);
      await rejectsWith(alice.registerEvidence({ caseRef: CASE_A, sha256: HASH_1, cid: CID, caseDigest: "0".repeat(64) }), LEDGER_ERROR.INVALID_INPUT);
      await rejectsWith(alice.registerEvidence({ caseRef: CASE_A, sha256: HASH_1, cid: CID }), LEDGER_ERROR.INVALID_INPUT);
      assert.equal((await alice.listEvidence()).length, 0);
    },
  },
  {
    name: "verifyHash is a free read; logVerification records match or mismatch",
    async run(ctx) {
      await registerAs(ctx, "alice");
      assert.equal(await ctx.as("carol").verifyHash(1, HASH_1), true);
      assert.equal(await ctx.as("carol").verifyHash(1, HASH_2), false);

      await mine(ctx.as("bob").logVerification(1, HASH_1));
      await mine(ctx.as("bob").logVerification(1, HASH_2));
      const ev = await ctx.as("carol").getEvidence(1);
      assert.deepEqual(ev.custody.map((c) => c.action), ["Submitted", "VerifiedMatch", "VerifiedMismatch"]);
      assert.equal(ev.custody[2].actor, ctx.address("bob"));
      assert.equal(await ctx.as("carol").verifyChain(1), true);

      await rejectsWith(ctx.as("carol").logVerification(1, HASH_1), LEDGER_ERROR.NOT_AUTHORIZED);
    },
  },
  {
    name: "logAccess records who accessed the evidence and is investigator-only",
    async run(ctx) {
      await registerAs(ctx, "alice");
      await mine(ctx.as("bob").logAccess(1));
      const ev = await ctx.as("carol").getEvidence(1);
      assert.equal(ev.custodyCount, 2);
      assert.equal(ev.custody[1].action, "Accessed");
      assert.equal(ev.custody[1].actor, ctx.address("bob"));
      for (const who of ["chief", "carol", "dave"]) {
        await rejectsWith(ctx.as(who).logAccess(1), LEDGER_ERROR.NOT_AUTHORIZED);
      }
    },
  },
  {
    name: "custody can only be transferred by the custodian, to another investigator",
    async run(ctx) {
      await registerAs(ctx, "alice");
      await rejectsWith(ctx.as("bob").transferCustody(1, ctx.address("alice")), LEDGER_ERROR.NOT_CUSTODIAN);
      await rejectsWith(ctx.as("alice").transferCustody(1, ctx.address("carol")), LEDGER_ERROR.INVALID_RECIPIENT);
      await rejectsWith(ctx.as("alice").transferCustody(1, ctx.address("dave")), LEDGER_ERROR.INVALID_RECIPIENT);
      await rejectsWith(ctx.as("alice").transferCustody(1, ctx.address("alice")), LEDGER_ERROR.INVALID_RECIPIENT);

      await mine(ctx.as("alice").transferCustody(1, ctx.address("bob")));
      let ev = await ctx.as("carol").getEvidence(1);
      assert.equal(ev.custodian, ctx.address("bob"));
      assert.equal(ev.custody[1].action, "Transferred");
      assert.equal(ev.custody[1].counterparty, ctx.address("bob"));

      await rejectsWith(ctx.as("alice").transferCustody(1, ctx.address("bob")), LEDGER_ERROR.NOT_CUSTODIAN);
      await mine(ctx.as("bob").transferCustody(1, ctx.address("alice")));
      ev = await ctx.as("carol").getEvidence(1);
      assert.equal(ev.custodian, ctx.address("alice"));
      assert.equal(await ctx.as("carol").verifyChain(1), true);
    },
  },
  {
    name: "the Chief grants and revokes roles; members are listed; others cannot grant",
    async run(ctx) {
      const members = await ctx.as("dave").listRoleMembers();
      assert.equal(members.chief, ctx.address("chief"));
      assert.deepEqual([...members.investigators].sort(), [ctx.address("alice"), ctx.address("bob")].sort());
      assert.deepEqual(members.auditors, [ctx.address("carol")]);
      assert.deepEqual(members.admins, []);

      await rejectsWith(ctx.as("alice").grantRole("auditor", ctx.address("dave"), 1), LEDGER_ERROR.NOT_AUTHORIZED);

      await mine(ctx.as("chief").grantRole("investigator", ctx.address("dave"), 1));
      assert.deepEqual(await ctx.as("dave").getIdentity(ctx.address("dave")), { role: "investigator", branchId: 1 });
      assert.deepEqual(await ctx.as("dave").getRoles(ctx.address("dave")), { isChief: false, isAdmin: false, isInvestigator: true, isAuditor: false });
      assert.equal(await registerAs(ctx, "dave"), 1);

      await mine(ctx.as("chief").revokeRole("investigator", ctx.address("dave")));
      assert.deepEqual(await ctx.as("dave").getRoles(ctx.address("dave")), { isChief: false, isAdmin: false, isInvestigator: false, isAuditor: false });
      await rejectsWith(ctx.as("dave").logAccess(1), LEDGER_ERROR.NOT_AUTHORIZED);
      assert.ok(!(await ctx.as("dave").listRoleMembers()).investigators.includes(ctx.address("dave")));
      assert.deepEqual(await ctx.as("dave").getIdentity(ctx.address("dave")), { role: null, branchId: 0 });

      // The Chief has no evidence powers of its own.
      assert.deepEqual(await ctx.as("chief").getRoles(ctx.address("chief")), { isChief: true, isAdmin: false, isInvestigator: false, isAuditor: false });
    },
  },
  {
    name: "the Chief appoints Branch Admins; a Branch Admin manages working roles in its branch and can pause, but cannot appoint Admins or write evidence",
    async run(ctx) {
      await rejectsWith(ctx.as("alice").grantRole("admin", ctx.address("dave"), 1), LEDGER_ERROR.NOT_AUTHORIZED);
      await mine(ctx.as("chief").grantRole("admin", ctx.address("dave"), 1));
      assert.deepEqual(await ctx.as("carol").getRoles(ctx.address("dave")), { isChief: false, isAdmin: true, isInvestigator: false, isAuditor: false });
      const members = await ctx.as("carol").listRoleMembers();
      assert.deepEqual(members.admins, [ctx.address("dave")]);
      assert.equal(members.branchOf[ctx.address("dave")], 1);

      // Working roles in its own branch: yes.
      await mine(ctx.as("dave").revokeRole("investigator", ctx.address("bob")));
      await mine(ctx.as("dave").grantRole("auditor", ctx.address("bob"), 1));
      assert.deepEqual(await ctx.as("carol").getRoles(ctx.address("bob")), { isChief: false, isAdmin: false, isInvestigator: false, isAuditor: true });
      await mine(ctx.as("dave").revokeRole("auditor", ctx.address("bob")));
      assert.equal((await ctx.as("carol").getRoles(ctx.address("bob"))).isAuditor, false);

      // In another branch: no.
      await rejectsWith(ctx.as("dave").grantRole("auditor", ctx.address("bob"), 2), LEDGER_ERROR.NOT_AUTHORIZED);

      // Other Admins: no.
      await rejectsWith(ctx.as("dave").grantRole("admin", ctx.address("bob"), 1), LEDGER_ERROR.NOT_AUTHORIZED);

      // Pause: yes. Evidence: no.
      await mine(ctx.as("dave").pause());
      assert.equal(await ctx.as("carol").isPaused(), true);
      await mine(ctx.as("dave").unpause());
      await rejectsWith(ctx.as("dave").registerEvidence({ caseRef: CASE_A, sha256: HASH_1, cid: CID, caseDigest: DIGEST }), LEDGER_ERROR.NOT_AUTHORIZED);

      // Removed by the Chief, the powers go at once.
      await mine(ctx.as("chief").revokeRole("admin", ctx.address("dave")));
      await rejectsWith(ctx.as("dave").grantRole("auditor", ctx.address("bob"), 1), LEDGER_ERROR.NOT_AUTHORIZED);
    },
  },
  {
    name: "branches compartmentalise cases: a case belongs to the branch that opened it",
    async run(ctx) {
      assert.deepEqual(
        (await ctx.as("dave").listBranches()).map((b) => b.id),
        [1, 2]
      );
      await rejectsWith(ctx.as("alice").createBranch("Rogue Branch"), LEDGER_ERROR.NOT_AUTHORIZED);
      await rejectsWith(ctx.as("chief").createBranch(""), LEDGER_ERROR.INVALID_INPUT);
      await mine(ctx.as("chief").createBranch("South Branch"));
      assert.deepEqual((await ctx.as("dave").listBranches()).at(-1), { id: 3, name: "South Branch" });

      // One branch role per address; unknown branches are refused.
      await rejectsWith(ctx.as("chief").grantRole("auditor", ctx.address("alice"), 1), LEDGER_ERROR.INVALID_INPUT);
      await rejectsWith(ctx.as("chief").grantRole("investigator", ctx.address("dave"), 9), LEDGER_ERROR.INVALID_INPUT);
      await mine(ctx.as("chief").grantRole("investigator", ctx.address("dave"), 2));

      const id = await registerAs(ctx, "alice");
      assert.equal((await ctx.as("carol").getEvidence(id)).branchId, 1);
      await rejectsWith(ctx.as("dave").logAccess(id), LEDGER_ERROR.NOT_AUTHORIZED);
      await rejectsWith(ctx.as("dave").logVerification(id, HASH_1), LEDGER_ERROR.NOT_AUTHORIZED);
      await rejectsWith(ctx.as("dave").registerEvidence({ caseRef: CASE_A, sha256: HASH_2, cid: CID, caseDigest: DIGEST }), LEDGER_ERROR.NOT_AUTHORIZED);
      await rejectsWith(ctx.as("alice").transferCustody(id, ctx.address("dave")), LEDGER_ERROR.INVALID_RECIPIENT);
      await rejectsWith(ctx.as("chief").reassignCustody(id, ctx.address("dave")), LEDGER_ERROR.INVALID_RECIPIENT);

      const own = await registerAs(ctx, "dave", { caseRef: CASE_B });
      assert.equal((await ctx.as("carol").getEvidence(own)).branchId, 2);
    },
  },
  {
    name: "pause stops investigator writes; the Chief can still recover stranded custody",
    async run(ctx) {
      await registerAs(ctx, "alice");
      await mine(ctx.as("chief").pause());
      assert.equal(await ctx.as("carol").isPaused(), true);

      await rejectsWith(ctx.as("alice").logAccess(1), LEDGER_ERROR.PAUSED);
      await rejectsWith(ctx.as("alice").registerEvidence({ caseRef: CASE_B, sha256: HASH_2, cid: CID, caseDigest: DIGEST }), LEDGER_ERROR.PAUSED);
      await rejectsWith(ctx.as("alice").pause(), LEDGER_ERROR.NOT_AUTHORIZED);

      await mine(ctx.as("chief").reassignCustody(1, ctx.address("bob")));
      const ev = await ctx.as("carol").getEvidence(1);
      assert.equal(ev.custodian, ctx.address("bob"));
      assert.equal(ev.custody.at(-1).action, "Reassigned");
      assert.equal(ev.custody.at(-1).actor, ctx.address("chief"));

      await mine(ctx.as("chief").unpause());
      assert.equal(await ctx.as("carol").isPaused(), false);
      await mine(ctx.as("bob").logAccess(1));
      assert.equal(await ctx.as("carol").verifyChain(1), true);
    },
  },
  {
    name: "links the records of each case into a SHA-256 chain, starting from the case's genesis value",
    async run(ctx) {
      await registerAs(ctx, "alice"); // id 1: case A #0
      await registerAs(ctx, "bob", { caseRef: CASE_B }); // id 2: case B #0
      await registerAs(ctx, "bob", { sha256: HASH_2, caseDigest: DIGEST_2 }); // id 3: case A #1, after an edit of the case details

      const [first, other, second] = await ctx.as("carol").listEvidence();
      const fields = (ev) => ({ sha256: ev.sha256, cid: ev.cid, officer: ev.submitter, timestamp: ev.submittedAt });
      assert.equal(first.caseIndex, 0);
      assert.equal(first.link, computeLink(caseGenesis(CASE_A), fields(first)));
      assert.equal(second.caseIndex, 1);
      assert.equal(second.link, computeLink(first.link, fields(second)));
      assert.equal(other.caseIndex, 0);
      assert.equal(other.link, computeLink(caseGenesis(CASE_B), fields(other)));
      // Each record keeps the case-details digest it anchored; the digest is not part of the link.
      assert.deepEqual([first.caseDigest, second.caseDigest], [DIGEST, DIGEST_2]);
    },
  },
  {
    name: "unknown evidence is reported as such",
    async run(ctx) {
      await rejectsWith(ctx.as("carol").getEvidence(99), LEDGER_ERROR.UNKNOWN_EVIDENCE);
      await rejectsWith(ctx.as("alice").logAccess(99), LEDGER_ERROR.UNKNOWN_EVIDENCE);
    },
  },
];
