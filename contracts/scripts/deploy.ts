// Deploys EvidenceLocker, creates its branches and, optionally, grants branch roles.
//
//   Local, in-memory chain (no keys, nothing to configure; gone when the command exits):
//     npx hardhat run scripts/deploy.ts
//
//   Local persistent chain your MetaMask can use (chain id 31337, RPC http://127.0.0.1:8545):
//     npx hardhat node                                         # in one terminal; leave it running
//     npx hardhat run scripts/deploy.ts --network localhost    # in another
//
//   Sepolia testnet (development only; see the privacy note in EvidenceLocker.sol):
//     npx hardhat keystore set SEPOLIA_RPC_URL
//     npx hardhat keystore set DEPLOYER_PRIVATE_KEY      # a throwaway testnet key, never a real one
//     npx hardhat run scripts/deploy.ts --network sepolia
//
// Environment (all optional):
//   ADMIN_ADDRESS     first admin ("Chief"). Defaults to the deployer. Use a multisig for anything real.
//   ADMIN_DELAY_SECS  delay for transferring the admin role. Defaults to 3 days.
//   BRANCHES          comma-separated branch names, created in order as branch 1, 2, ... Defaults to "Central Lab".
//                     Branch names are public: use locations, never people.
//   ADMINS            comma-separated addresses to grant BRANCH_ADMIN_ROLE (needs ADMIN_ADDRESS unset, so the deployer
//   INVESTIGATORS     is the Chief and can grant). Same for INVESTIGATOR_ROLE and AUDITOR_ROLE. Each entry is
//   AUDITORS          "0xAddress" (branch 1) or "0xAddress@2" (branch 2). An address holds at most one branch role.
//   On the local chain (31337) every address named above is also sent 10 test ETH, so it can pay for transactions.
import { network } from "hardhat";

const DEFAULT_ADMIN_DELAY_SECS = 3 * 24 * 60 * 60;
const LOCAL_CHAIN_ID = 31337n;

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

/** Parses "0xAddress" or "0xAddress@branchId" entries; the branch defaults to 1. */
function memberList(name: string, branchCount: number): { address: string; branchId: number }[] {
  const list = (process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.map((entry) => {
    const [address, branch = "1"] = entry.split("@");
    const branchId = Number(branch);
    if (!ethers.isAddress(address)) throw new Error(`${name}: "${address}" is not a valid address`);
    if (!Number.isInteger(branchId) || branchId < 1 || branchId > branchCount) throw new Error(`${name}: "${entry}" names an unknown branch`);
    return { address: ethers.getAddress(address), branchId };
  });
}

const admin = process.env.ADMIN_ADDRESS ?? deployer.address;
const delay = Number(process.env.ADMIN_DELAY_SECS ?? DEFAULT_ADMIN_DELAY_SECS);
if (!ethers.isAddress(admin)) throw new Error("ADMIN_ADDRESS is not a valid address");
if (!Number.isInteger(delay) || delay < 0) throw new Error("ADMIN_DELAY_SECS must be a non-negative integer");
// Only the Chief creates branches and grants roles, so with a separate Chief (ADMIN_ADDRESS, e.g. a multisig) the
// script deploys only and the Chief sets up branches on the Role Management page.
const deployerIsChief = ethers.getAddress(admin) === deployer.address;
const branchNames = deployerIsChief ? (process.env.BRANCHES ?? "Central Lab").split(",").map((s) => s.trim()).filter(Boolean) : [];
if (deployerIsChief && branchNames.length === 0) throw new Error("BRANCHES must name at least one branch");
const knownBranches = deployerIsChief ? branchNames.length : Infinity; // checked below when the deployer is not the Chief
const admins = memberList("ADMINS", knownBranches);
const investigators = memberList("INVESTIGATORS", knownBranches);
const auditors = memberList("AUDITORS", knownBranches);
if (!deployerIsChief && (process.env.BRANCHES || admins.length || investigators.length || auditors.length)) {
  throw new Error("BRANCHES / ADMINS / INVESTIGATORS / AUDITORS need the deployer to be the Chief. Unset ADMIN_ADDRESS, or set them up from the Chief's wallet on the Role Management page.");
}

console.log(`Deploying EvidenceLocker from ${deployer.address}`);
console.log(`  chief:        ${admin}`);
console.log(`  admin delay:  ${delay} s`);

const locker = await ethers.deployContract("EvidenceLocker", [delay, admin]);
await locker.waitForDeployment();
const address = await locker.getAddress();
const receipt = await locker.deploymentTransaction()?.wait();
const { chainId } = await ethers.provider.getNetwork();

for (const [i, name] of branchNames.entries()) {
  await (await locker.createBranch(name)).wait();
  console.log(`  branch ${i + 1}:     ${name}`);
}
const roles = [
  ["branch admin", await locker.BRANCH_ADMIN_ROLE(), admins],
  ["investigator", await locker.INVESTIGATOR_ROLE(), investigators],
  ["auditor", await locker.AUDITOR_ROLE(), auditors],
] as const;
for (const [label, role, members] of roles) {
  for (const { address: a, branchId } of members) {
    await (await locker.grantBranchRole(role, a, branchId)).wait();
    console.log(`  ${label}: ${a} (branch ${branchId})`);
  }
}

if (chainId === LOCAL_CHAIN_ID) {
  for (const a of new Set([admin, ...[...admins, ...investigators, ...auditors].map((m) => m.address)])) {
    if (a === deployer.address) continue;
    await (await deployer.sendTransaction({ to: a, value: ethers.parseEther("10") })).wait();
  }
}

console.log("");
console.log(`EvidenceLocker deployed at ${address}`);
console.log(`Deployment block: ${receipt?.blockNumber}`);
console.log("");
console.log("Add these to the web app's .env (they are public values, not secrets):");
console.log(`  VITE_LOCKER_ADDRESS=${address}`);
console.log(`  VITE_LOCKER_DEPLOY_BLOCK=${receipt?.blockNumber}`);
console.log(`  VITE_CHAIN_ID=${chainId}`);
