import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    // A persistent local chain started with `npx hardhat node` (chain id 31337). MetaMask can connect to it at
    // http://127.0.0.1:8545, so roles granted here are real on-chain roles you can test with your own wallets.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // Public testnet for development only. Both values are read from the environment (or Hardhat's encrypted
    // keystore) at the moment a Sepolia command runs; they are never stored in this repository.
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
