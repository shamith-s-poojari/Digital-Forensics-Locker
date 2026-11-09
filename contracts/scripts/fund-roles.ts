// Tops up every demo role wallet named in the web app's .env, paid from the deployer (Chief) wallet.
//
//   Try it on a throwaway in-memory chain (no keys, nothing real is sent):
//     npx hardhat run scripts/fund-roles.ts
//
//   Sepolia (asks for the Hardhat keystore password):
//     npx hardhat run scripts/fund-roles.ts --network sepolia
//
// Wallets come from VITE_DEMO_ADMINS, VITE_DEMO_INVESTIGATORS and VITE_DEMO_AUDITORS. Each is topped up to the target,
// so a wallet that already holds enough is skipped and the script is safe to run again.
//
// Environment (all optional):
//   FUND_TARGET_ETH    balance each wallet should end up with. Defaults to 0.004.
//   FUND_RESERVE_ETH   balance the deployer must keep; nothing is sent if the top-ups would go below it. Defaults to 0.003.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const SEPOLIA_CHAIN_ID = 11155111n;
const LOCAL_CHAIN_ID = 31337n;
const ROLE_VARIABLES = ["VITE_DEMO_ADMINS", "VITE_DEMO_INVESTIGATORS", "VITE_DEMO_AUDITORS"];

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

const { chainId } = await ethers.provider.getNetwork();
if (chainId !== SEPOLIA_CHAIN_ID && chainId !== LOCAL_CHAIN_ID) {
  throw new Error(`Refusing to send funds on chain ${chainId}: only Sepolia and the local chain are allowed`);
}

const target = ethers.parseEther(process.env.FUND_TARGET_ETH ?? "0.004");
const reserve = ethers.parseEther(process.env.FUND_RESERVE_ETH ?? "0.003");

const envText = readFileSync(fileURLToPath(new URL("../../.env", import.meta.url)), "utf8");
const addresses = new Set<string>();
for (const name of ROLE_VARIABLES) {
  const line = envText.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  const entries = (line?.slice(name.length + 1) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    if (!ethers.isAddress(entry)) throw new Error(`${name}: "${entry}" is not a valid address`);
    addresses.add(ethers.getAddress(entry));
  }
}
addresses.delete(deployer.address);
if (addresses.size === 0) throw new Error(`No wallets found in ${ROLE_VARIABLES.join(", ")}`);

const topUps: { address: string; amount: bigint }[] = [];
for (const address of addresses) {
  const balance = await ethers.provider.getBalance(address);
  if (balance < target) topUps.push({ address, amount: target - balance });
}

const available = await ethers.provider.getBalance(deployer.address);
const total = topUps.reduce((sum, t) => sum + t.amount, 0n);
console.log(`Chain ${chainId}, paying from ${deployer.address}`);
console.log(`  balance:  ${ethers.formatEther(available)} ETH`);
console.log(`  to send:  ${ethers.formatEther(total)} ETH to ${topUps.length} of ${addresses.size} wallets`);
if (available < total + reserve) {
  throw new Error(`Not enough funds: sending ${ethers.formatEther(total)} ETH would leave less than the ${ethers.formatEther(reserve)} ETH reserve. Nothing was sent. Lower FUND_TARGET_ETH or use a faucet.`);
}

for (const { address, amount } of topUps) {
  const tx = await deployer.sendTransaction({ to: address, value: amount });
  await tx.wait();
  console.log(`  sent ${ethers.formatEther(amount)} ETH to ${address} (${tx.hash})`);
}

console.log("");
console.log("Balances:");
for (const address of [deployer.address, ...addresses]) {
  console.log(`  ${address}  ${ethers.formatEther(await ethers.provider.getBalance(address))} ETH`);
}
