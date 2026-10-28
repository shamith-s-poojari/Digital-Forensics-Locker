// Sign-In with Ethereum (EIP-4361) messages: the exact text a wallet signs to prove control of an address.
//
// Shared by the browser (which builds the message) and the server (server/siweAuth.js, which parses and checks it),
// so both sides agree byte for byte. Dependency-free on purpose: the server imports it from Node.
//
// Only the subset this app produces is accepted. The parser rebuilds the message from the fields it read and
// requires the result to equal the input, so a message with extra, missing or reordered lines is rejected.

export const SIWE_STATEMENT = "Sign in to Digital Forensics Locker. This proves you control this wallet. It is not a transaction and costs no gas.";

const HEADER_SUFFIX = " wants you to sign in with your Ethereum account:";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const NONCE = /^[A-Za-z0-9]{8,64}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const MAX_MESSAGE_LENGTH = 1024;

/**
 * @typedef {object} SiweFields
 * @property {string} domain          Host the user is signing in to, e.g. "localhost:5173".
 * @property {string} address         EIP-55 checksummed address.
 * @property {string} uri             Origin of the page, e.g. "http://localhost:5173".
 * @property {number} chainId
 * @property {string} nonce           Server-issued, single use.
 * @property {string} issuedAt        ISO 8601, UTC.
 * @property {string} expirationTime  ISO 8601, UTC. The signature is refused after this time.
 * @property {string} [statement]
 */

/** @param {SiweFields} fields */
export function buildSiweMessage({ domain, address, uri, chainId, nonce, issuedAt, expirationTime, statement = SIWE_STATEMENT }) {
  return [
    `${domain}${HEADER_SUFFIX}`,
    address,
    "",
    statement,
    "",
    `URI: ${uri}`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join("\n");
}

/**
 * Parses a message produced by `buildSiweMessage`. Returns null for anything else.
 *
 * @param {unknown} text
 * @returns {SiweFields | null}
 */
export function parseSiweMessage(text) {
  if (typeof text !== "string" || text.length > MAX_MESSAGE_LENGTH) return null;
  const lines = text.split("\n");
  if (lines.length !== 11 || !lines[0].endsWith(HEADER_SUFFIX)) return null;

  const field = (line, key) => (line.startsWith(`${key}: `) ? line.slice(key.length + 2) : null);
  const domain = lines[0].slice(0, -HEADER_SUFFIX.length);
  const address = lines[1];
  const statement = lines[3];
  const uri = field(lines[5], "URI");
  const chainIdText = field(lines[7], "Chain ID");
  const nonce = field(lines[8], "Nonce");
  const issuedAt = field(lines[9], "Issued At");
  const expirationTime = field(lines[10], "Expiration Time");

  if (!domain || /\s/.test(domain) || !ADDRESS.test(address) || !uri) return null;
  if (!chainIdText || !/^[1-9]\d{0,15}$/.test(chainIdText)) return null;
  if (!nonce || !NONCE.test(nonce)) return null;
  if (!issuedAt || !ISO_TIME.test(issuedAt) || !expirationTime || !ISO_TIME.test(expirationTime)) return null;

  const parsed = { domain, address, uri, chainId: Number(chainIdText), nonce, issuedAt, expirationTime, statement };
  return buildSiweMessage(parsed) === text ? parsed : null;
}
