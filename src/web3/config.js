import { getAddress, isAddress } from "ethers";

export const SEPOLIA_CHAIN_ID = 11155111;

export const CHAIN_NAMES = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia",
  31337: "Hardhat Local",
};

/**
 * The only build-time variables this app reads. Every one is a PUBLIC value.
 *
 * SECURITY: each variable is read by name, on purpose. Never pass `import.meta.env` around as a whole object (as in
 * `env = import.meta.env`): Vite then inlines EVERY VITE_* variable in .env into the public JavaScript bundle,
 * including any secret that was ever put there. A test (noBareEnv.test.js) and a bundle scan guard against this.
 */
function publicEnv() {
  return {
    VITE_LOCKER_ADDRESS: import.meta.env.VITE_LOCKER_ADDRESS,
    VITE_CHAIN_ID: import.meta.env.VITE_CHAIN_ID,
    VITE_LOCKER_DEPLOY_BLOCK: import.meta.env.VITE_LOCKER_DEPLOY_BLOCK,
    VITE_EXPLORER_URL: import.meta.env.VITE_EXPLORER_URL,
    DEV: import.meta.env.DEV,
    MODE: import.meta.env.MODE,
  };
}

const DEFAULT_EXPLORERS = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
};

/**
 * Reads the on-chain configuration from Vite environment variables. Every value here is PUBLIC (it ends up
 * in the browser bundle): a contract address, a chain id and a block number. Never put a key or token in a
 * VITE_* variable.
 *
 * @param {Record<string, string | undefined>} env
 */
export function readLockerConfig(env = publicEnv()) {
  const rawAddress = (env.VITE_LOCKER_ADDRESS ?? "").trim();
  const address = rawAddress && isAddress(rawAddress) ? getAddress(rawAddress) : null;

  const chainId = Number(env.VITE_CHAIN_ID) > 0 ? Number(env.VITE_CHAIN_ID) : SEPOLIA_CHAIN_ID;
  const deployBlock = Number(env.VITE_LOCKER_DEPLOY_BLOCK) > 0 ? Number(env.VITE_LOCKER_DEPLOY_BLOCK) : 0;
  const explorerUrl = (env.VITE_EXPLORER_URL ?? DEFAULT_EXPLORERS[chainId] ?? "").replace(/\/+$/, "");

  return {
    address,
    chainId,
    chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
    deployBlock,
    explorerUrl,
    configured: address !== null,
    /** True when an address was supplied but is not a valid one (a typo that must not silently become "demo"). */
    invalidAddress: rawAddress !== "" && address === null,
  };
}

export const lockerConfig = readLockerConfig();

/** Link to a transaction on the block explorer, or null when no explorer is known (local chains). */
export function txUrl(config, hash) {
  return config.explorerUrl && hash ? `${config.explorerUrl}/tx/${hash}` : null;
}

export function addressUrl(config, address) {
  return config.explorerUrl && address ? `${config.explorerUrl}/address/${address}` : null;
}

/**
 * Demo mode (an in-memory ledger with a role previewer) exists only for development and tests. A production
 * build with no contract configured therefore fails CLOSED: nobody is authorised.
 */
export function isDemoAllowed(env = publicEnv()) {
  return Boolean(env.DEV) || env.MODE === "test";
}
