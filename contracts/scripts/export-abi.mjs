// Copies the compiled ABI into the frontend so the app and the contract can never silently disagree.
// Run after `npm run compile`:  npm run abi
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifact = path.join(here, "..", "artifacts", "contracts", "EvidenceLocker.sol", "EvidenceLocker.json");
const target = path.join(here, "..", "..", "src", "web3", "EvidenceLocker.abi.json");

if (!fs.existsSync(artifact)) {
  console.error("Compiled artifact not found. Run `npm run compile` first.");
  process.exit(1);
}

const { abi } = JSON.parse(fs.readFileSync(artifact, "utf8"));
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(abi, null, 2) + "\n");
console.log(`Wrote ${abi.length} ABI entries to ${path.relative(process.cwd(), target)}`);
