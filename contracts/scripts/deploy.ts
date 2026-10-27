// Deploys EvidenceLocker.
//
//   Local, in-memory chain (no keys, nothing to configure):
//     npx hardhat run scripts/deploy.ts
//
//   Sepolia testnet (development only; see the privacy note in EvidenceLocker.sol):
//     npx hardhat keystore set SEPOLIA_RPC_URL
//     npx hardhat keystore set DEPLOYER_PRIVATE_KEY      # a throwaway testnet key, never a real one
//     npx hardhat run scripts/deploy.ts --network sepolia
//
// Environment (all optional):
//   ADMIN_ADDRESS     first admin ("Chief"). Defaults to the deployer. Use a multisig for anything real.
//   ADMIN_DELAY_SECS  delay for transferring the admin role. Defaults to 3 days.
import { network } from "hardhat";

const DEFAULT_ADMIN_DELAY_SECS = 3 * 24 * 60 * 60;

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

const admin = process.env.ADMIN_ADDRESS ?? deployer.address;
const delay = Number(process.env.ADMIN_DELAY_SECS ?? DEFAULT_ADMIN_DELAY_SECS);
if (!ethers.isAddress(admin)) throw new Error("ADMIN_ADDRESS is not a valid address");
if (!Number.isInteger(delay) || delay < 0) throw new Error("ADMIN_DELAY_SECS must be a non-negative integer");

console.log(`Deploying EvidenceLocker from ${deployer.address}`);
console.log(`  admin:        ${admin}`);
console.log(`  admin delay:  ${delay} s`);

const locker = await ethers.deployContract("EvidenceLocker", [delay, admin]);
await locker.waitForDeployment();
const address = await locker.getAddress();
const receipt = await locker.deploymentTransaction()?.wait();

console.log("");
console.log(`EvidenceLocker deployed at ${address}`);
console.log(`Deployment block: ${receipt?.blockNumber}`);
console.log("");
console.log("Add these to the web app's .env (they are public values, not secrets):");
console.log(`  VITE_LOCKER_ADDRESS=${address}`);
console.log(`  VITE_LOCKER_DEPLOY_BLOCK=${receipt?.blockNumber}`);
console.log(`  VITE_CHAIN_ID=${(await ethers.provider.getNetwork()).chainId}`);
