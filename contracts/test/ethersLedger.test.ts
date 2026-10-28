// Runs the frontend's EthersLedger against the REAL EvidenceLocker contract on a local Hardhat chain, using the
// exact scenario suite that the in-memory demo ledger also passes (src/web3/ledgerScenarios.js). It also proves
// that the ABI exported to the frontend (src/web3/EvidenceLocker.abi.json) matches the compiled contract.
import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain JavaScript modules from the web app, no type declarations
import { createEthersLedger } from "../../src/web3/ethersLedger.js";
// @ts-expect-error plain JavaScript module from the web app
import { scenarios } from "../../src/web3/ledgerScenarios.js";

const { ethers } = await network.connect();

const abi = JSON.parse(readFileSync(fileURLToPath(new URL("../../src/web3/EvidenceLocker.abi.json", import.meta.url)), "utf8"));

async function makeContext() {
  const [chief, alice, bob, carol, dave] = await ethers.getSigners();
  const locker = await ethers.deployContract("EvidenceLocker", [3 * 24 * 60 * 60, chief.address]);
  const address = await locker.getAddress();
  await locker.connect(chief).grantRole(await locker.INVESTIGATOR_ROLE(), alice.address);
  await locker.connect(chief).grantRole(await locker.INVESTIGATOR_ROLE(), bob.address);
  await locker.connect(chief).grantRole(await locker.AUDITOR_ROLE(), carol.address);

  const signers = { chief, alice, bob, carol, dave } as const;
  type Name = keyof typeof signers;
  const ledgers: Partial<Record<Name, unknown>> = {};
  return {
    address,
    as: (name: Name) =>
      (ledgers[name] ??= createEthersLedger({ provider: ethers.provider, getSigner: async () => signers[name], address, abi, deployBlock: 0 })),
    address_: (name: Name) => signers[name].address,
    // The shared scenarios call ctx.address(name) for actor addresses.
    get addressOf() {
      return (name: Name) => signers[name].address;
    },
  };
}

describe("EthersLedger against the real contract", () => {
  describe("shared ledger scenarios (also run against the demo ledger)", () => {
    for (const scenario of scenarios as Array<{ name: string; run: (ctx: unknown) => Promise<void> }>) {
      it(scenario.name, async () => {
        const base = await makeContext();
        await scenario.run({ as: base.as, address: base.addressOf });
      });
    }
  });

  describe("chain-specific behaviour", () => {
    it("exported ABI matches the compiled contract", async () => {
      const artifact = JSON.parse(
        readFileSync(fileURLToPath(new URL("../artifacts/contracts/EvidenceLocker.sol/EvidenceLocker.json", import.meta.url)), "utf8")
      );
      expect(abi).to.deep.equal(artifact.abi);
    });

    it("links each custody entry to its transaction hash and block", async () => {
      const base = await makeContext();
      const ledger = base.as("alice") as {
        registerEvidence: (a: object) => Promise<{ hash: string; wait: () => Promise<{ hash: string; blockNumber: number; evidenceId: number }> }>;
        logAccess: (id: number) => Promise<{ hash: string; wait: () => Promise<{ hash: string; blockNumber: number }> }>;
        getCustodyTxs: (id: number) => Promise<Record<number, { txHash: string; blockNumber: number }>>;
      };

      const registered = await ledger.registerEvidence({ caseRef: ethers.id("c"), sha256: "ab".repeat(32), cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", caseDigest: "d1".repeat(32) });
      const first = await registered.wait();
      const accessed = await (await ledger.logAccess(first.evidenceId)).wait();

      const txs = await ledger.getCustodyTxs(first.evidenceId);
      expect(txs[0].txHash).to.equal(first.hash);
      expect(txs[0].blockNumber).to.equal(first.blockNumber);
      expect(txs[1].txHash).to.equal(accessed.hash);
    });

    it("returns the transaction hash as soon as the wallet signs, before it is mined", async () => {
      const base = await makeContext();
      const ledger = base.as("alice") as {
        registerEvidence: (a: object) => Promise<{ hash: string; wait: () => Promise<unknown> }>;
      };
      const handle = await ledger.registerEvidence({ caseRef: ethers.id("c2"), sha256: "cd".repeat(32), cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", caseDigest: "d1".repeat(32) });
      expect(handle.hash).to.match(/^0x[0-9a-f]{64}$/);
      await handle.wait();
    });

    it("rejects malformed input before anything is sent", async () => {
      const base = await makeContext();
      const ledger = base.as("chief") as { grantRole: (r: string, a: string) => Promise<unknown> };
      let code = "";
      try {
        await ledger.grantRole("investigator", "not-an-address");
      } catch (err) {
        code = (err as { code: string }).code;
      }
      expect(code).to.equal("InvalidInput");
    });

    it("notifies subscribers when evidence is registered", async () => {
      const base = await makeContext();
      const alice = base.as("alice") as {
        registerEvidence: (a: object) => Promise<{ wait: () => Promise<unknown> }>;
        subscribe: (cb: () => void) => () => void;
      };
      let calls = 0;
      const unsubscribe = alice.subscribe(() => calls++);
      // Always unsubscribe: a listener left polling keeps the test process alive after a failure.
      try {
        await (await alice.registerEvidence({ caseRef: ethers.id("c3"), sha256: "ef".repeat(32), cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", caseDigest: "d1".repeat(32) })).wait();
        for (let i = 0; i < 40 && calls === 0; i++) {
          await ethers.provider.send("evm_mine", []); // nudge the provider's event polling
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } finally {
        unsubscribe();
      }
      expect(calls).to.be.greaterThan(0);
    });
  });
});
