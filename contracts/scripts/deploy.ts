// Deploys EvidenceLocker and, optionally, grants the working roles.
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
//   ADMINS            comma-separated addresses to grant ADMIN_ROLE (needs ADMIN_ADDRESS unset, so the deployer
//   INVESTIGATORS     is the Chief and can grant). Same for INVESTIGATOR_ROLE and AUDITOR_ROLE.
//   AUDITORS
//   On the local chain (31337) every address named above is also sent 10 test ETH, so it can pay for transactions.
import { network } from "hardhat";

const DEFAULT_ADMIN_DELAY_SECS = 3 * 24 * 60 * 60;
const LOCAL_CHAIN_ID = 31337n;

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

function addressList(name: string): string[] {
  const list = (process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const a of list) if (!ethers.isAddress(a)) throw new Error(`${name}: "${a}" is not a valid address`);
  return list.map((a) => ethers.getAddress(a));
}

const admin = process.env.ADMIN_ADDRESS ?? deployer.address;
const delay = Number(process.env.ADMIN_DELAY_SECS ?? DEFAULT_ADMIN_DELAY_SECS);
if (!ethers.isAddress(admin)) throw new Error("ADMIN_ADDRESS is not a valid address");
if (!Number.isInteger(delay) || delay < 0) throw new Error("ADMIN_DELAY_SECS must be a non-negative integer");
const admins = addressList("ADMINS");
const investigators = addressList("INVESTIGATORS");
const auditors = addressList("AUDITORS");
if ((admins.length || investigators.length || auditors.length) && ethers.getAddress(admin) !== deployer.address) {
  throw new Error("ADMINS / INVESTIGATORS / AUDITORS need the deployer to be the Chief. Unset ADMIN_ADDRESS, or grant the roles from the Chief's wallet on the Role Management page.");
}

console.log(`Deploying EvidenceLocker from ${deployer.address}`);
console.log(`  chief:        ${admin}`);
console.log(`  admin delay:  ${delay} s`);

const locker = await ethers.deployContract("EvidenceLocker", [delay, admin]);
await locker.waitForDeployment();
const address = await locker.getAddress();
const receipt = await locker.deploymentTransaction()?.wait();
const { chainId } = await ethers.provider.getNetwork();

const ADMIN_ROLE = await locker.ADMIN_ROLE();
const INVESTIGATOR_ROLE = await locker.INVESTIGATOR_ROLE();
const AUDITOR_ROLE = await locker.AUDITOR_ROLE();
for (const a of admins) {
  await (await locker.grantRole(ADMIN_ROLE, a)).wait();
  console.log(`  admin:        ${a}`);
}
for (const a of investigators) {
  await (await locker.grantRole(INVESTIGATOR_ROLE, a)).wait();
  console.log(`  investigator: ${a}`);
}
for (const a of auditors) {
  await (await locker.grantRole(AUDITOR_ROLE, a)).wait();
  console.log(`  auditor:      ${a}`);
}

if (chainId === LOCAL_CHAIN_ID) {
  for (const a of new Set([admin, ...admins, ...investigators, ...auditors])) {
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
