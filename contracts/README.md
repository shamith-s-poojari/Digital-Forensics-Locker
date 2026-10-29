# Contracts

`EvidenceLocker.sol` is the on-chain evidence register with role-based access control. Hardhat 3, OpenZeppelin 5, Solidity 0.8.28.

## Roles and branches

The roles form a hierarchy set with OpenZeppelin's `_setRoleAdmin` in the constructor: `DEFAULT_ADMIN_ROLE` (Chief) administers `BRANCH_ADMIN_ROLE`, which administers `INVESTIGATOR_ROLE` and `AUDITOR_ROLE`.

| Role | Holder | Can |
| --- | --- | --- |
| Chief (headquarters) | `DEFAULT_ADMIN_ROLE`, one address, two-step delayed transfer | Create branches, appoint and remove Branch Admins in any branch, grant and revoke Investigator and Auditor in any branch, pause and unpause, reassign stranded custody. **Cannot** register or log evidence unless also made an Investigator. |
| Branch Admin | `BRANCH_ADMIN_ROLE`, any number, appointed only by the Chief, bound to one branch | Grant and revoke Investigator and Auditor **in its own branch only**, pause and unpause. Cannot appoint Branch Admins, reassign custody, or write evidence. |
| Investigator | `INVESTIGATOR_ROLE`, bound to one branch | Register evidence, log access, log verification, transfer custody (only if current custodian, only to another Investigator of the same branch), all only for its own branch's cases. |
| Auditor | `AUDITOR_ROLE`, bound to one branch | No write permission. Reads and verifies like everyone else. |

- **Branches** are created by the Chief with `createBranch(name)` (ids from 1; `branchCount`, `branchName`). Names are public.
- **Identity:** every branch-role holder has a `UserIdentity { role, branchId }` (`identityOf`). An address holds at most one branch role, in one branch. Branch roles are granted only with `grantBranchRole(role, account, branchId)`; plain `grantRole` refuses them (`BranchRequired`). Revoking or renouncing clears the identity.
- **Cases:** the first registration of a case tags it with the investigator's branch (`caseBranch`, event `CaseOpened`). Every later registration, access log, verification and custody transfer for that case must come from the same branch (`OutsideBranch`), and custody can only move to an Investigator of that branch. `getEvidence` returns the record's `branchId`.
- Branch scoping of **reads** is not possible on a public chain; the web app filters what it shows and the API (case titles, access requests) enforces it server-side.

## What is on chain, and what is not

On chain: a SHA-256 of the evidence bytes, the CID of the stored (encrypted) copy, an opaque case id (`caseId`, a `uint256`; the web app calls the same 32 bytes `caseRef`), addresses, timestamps, a SHA-256 chain over the records of each case, and a hash chain over each evidence record's custody entries.

Each registration is an immutable **256-byte record** (8 storage slots: evidence SHA-256, CID, officer address, block timestamp, case id, link; the CID is held to 33..64 bytes so it fills exactly two data slots). The records of a case form a SHA-256 chain: `h_0 = SHA256(caseId)`, `h_i = SHA256(h_{i-1} || e_i || CID_i || W_i || T_i)` (packed), stored as each record's `link`. The timestamp comes from the block, never from the caller. `verifyCaseChain(caseId)` walks a case and returns the first mismatching index; `computeLink` and `caseGenesis` let anyone check their own implementation. `EvidenceRegistered` has the evidence hash as its first indexed topic, so finding every registration of a file is one log query.

 Never put a plaintext case number, person name or file name on chain: blockchain data is public and permanent. `caseRef` should be a salted hash computed off-chain.

**Reads cannot be restricted on a public chain.** The view functions are therefore open, and "read-only Auditor" means "no write permission", not secrecy. Addresses are pseudonymous but become linkable to people over time. For real law-enforcement use, deploy on a permissioned or private network. Sepolia is for development only.

## Commands

```bash
cd contracts
npm install
npm run compile
npm test                     # contract tests plus the web app's ledger scenarios run on the real contract
npm run abi                  # copies the ABI into ../src/web3/EvidenceLocker.abi.json
npx hardhat run scripts/deploy.ts          # deploy to an in-memory chain
npx hardhat node                           # persistent local chain for MetaMask (chain id 31337), then:
BRANCHES="Central Lab,North Branch" ADMINS=0x...@2 INVESTIGATORS=0x...,0x...@2 AUDITORS=0x... npx hardhat run scripts/deploy.ts --network localhost
```

`0xAddress@2` puts that address in branch 2; a bare address goes to branch 1.

`getUserRole(address)` returns the highest role an address holds as a string (`"Chief"`, `"Branch Admin"`, `"Investigator"`, `"Auditor"` or `"None"`), for display. Use `rolesOf` or `hasRole` for decisions, since the Chief can also hold a branch role.

Deploying to Sepolia: store `SEPOLIA_RPC_URL` and a throwaway `DEPLOYER_PRIVATE_KEY` in Hardhat's encrypted keystore (`npx hardhat keystore set ...`), then `npx hardhat run scripts/deploy.ts --network sepolia`. The script prints the `VITE_LOCKER_*` values for the web app. Never commit keys.

## Testing notes

The suite checks every role boundary, every revert, the pause behaviour, the admin-transfer delay, and recomputes the custody hash chain independently in JavaScript instead of trusting the contract's own answer. A tripwire test lists the exact set of state-changing functions, so adding one fails the test until it has been reviewed for access control and the append-only rule. The suite was also mutation-checked: eight deliberate bugs (dropped access checks, a broken duplicate check, a wrong verification result, a hash chain that ignores the actor, and others) were each caught.

`test/ethersLedger.test.ts` also runs the web app's `EthersLedger` against this contract using the same scenarios that the in-memory demo ledger passes (`src/web3/ledgerScenarios.js`), so the demo cannot drift from the real behaviour, and it asserts that the ABI shipped to the web app equals the compiled one. That is how a revert-decoding bug the demo could not reveal was found.

Not covered: formal verification, fuzzing and an external audit. An audit is mandatory before any real use (roadmap Phase 5).
