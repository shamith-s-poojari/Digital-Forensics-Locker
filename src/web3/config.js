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
    VITE_IPFS_GATEWAYS: import.meta.env.VITE_IPFS_GATEWAYS,
    VITE_DEMO_CHIEF: import.meta.env.VITE_DEMO_CHIEF,
    VITE_DEMO_ADMINS: import.meta.env.VITE_DEMO_ADMINS,
    VITE_DEMO_INVESTIGATORS: import.meta.env.VITE_DEMO_INVESTIGATORS,
    VITE_DEMO_AUDITORS: import.meta.env.VITE_DEMO_AUDITORS,
    DEV: import.meta.env.DEV,
    MODE: import.meta.env.MODE,
  };
}

/** Public IPFS gateways tried in order when the app fetches a stored copy to verify it. */
export const DEFAULT_IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://gateway.pinata.cloud/ipfs/"];

/** "https://a/ipfs/, https://b/ipfs" -> normalised list; HTTPS only (plain HTTP just for a local node). */
export function parseGateways(value) {
  const list = String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /^https:\/\//i.test(s) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(s))
    .map((s) => (s.endsWith("/") ? s : `${s}/`));
  return list.length ? list : DEFAULT_IPFS_GATEWAYS;
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
    ipfsGateways: parseGateways(env.VITE_IPFS_GATEWAYS),
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

/** "0xA, 0xB" -> checksummed addresses; anything that is not an address is dropped. */
function parseAddressList(value) {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isAddress(s))
    .map((s) => getAddress(s));
}

/**
 * Who holds which role on the in-memory demo ledger, the demo's equivalent of deploying the contract and granting
 * roles. Without it every wallet that connects to the demo has no role and is denied. All values are public addresses.
 *
 *   VITE_DEMO_CHIEF          the Chief (one address)
 *   VITE_DEMO_ADMINS         comma-separated
 *   VITE_DEMO_INVESTIGATORS  comma-separated
 *   VITE_DEMO_AUDITORS       comma-separated
 */
export function readDemoRoles(env = publicEnv()) {
  return {
    chief: parseAddressList(env.VITE_DEMO_CHIEF)[0] ?? null,
    admins: parseAddressList(env.VITE_DEMO_ADMINS),
    investigators: parseAddressList(env.VITE_DEMO_INVESTIGATORS),
    auditors: parseAddressList(env.VITE_DEMO_AUDITORS),
  };
}

/**
 * Demo mode (an in-memory ledger) exists only for development and tests. A production
 * build with no contract configured therefore fails CLOSED: nobody is authorised.
 */
export function isDemoAllowed(env = publicEnv()) {
  return Boolean(env.DEV) || env.MODE === "test";
}
