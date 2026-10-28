// Fails if the production build contains anything that looks like a secret.
//
// A VITE_* variable is copied into the public JavaScript bundle, and so is the whole of .env if code ever reads
// `import.meta.env` as an object. This scan runs after `vite build` and never prints the matched text, only where
// it was found, so the check itself cannot leak what it detects.
//
//   npm run build && npm run check:bundle
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = new URL("../dist", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PATTERNS = [
  { name: "a JWT (header.payload)", regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/ },
  { name: "a PEM private key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "a 64-hex private-key-like value assigned to a key/secret/token name", regex: /(?:private[_-]?key|secret|api[_-]?key|token)["']?\s*[:=]\s*["']?(?:0x)?[0-9a-fA-F]{64}\b/i },
  { name: "a VITE_ variable that holds a credential", regex: /VITE_[A-Z0-9_]*(?:PINATA|JWT|SECRET|PRIVATE|API_KEY|TOKEN)[A-Z0-9_]*/ },
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|mjs|css|html|map|json)$/.test(name)) yield path;
  }
}

let failed = false;
let scanned = 0;
try {
  for (const file of files(DIST)) {
    scanned += 1;
    const text = readFileSync(file, "utf8");
    for (const { name, regex } of PATTERNS) {
      if (regex.test(text)) {
        failed = true;
        console.error(`SECRET-LIKE CONTENT: ${name} found in ${relative(process.cwd(), file)}`);
      }
    }
  }
} catch (err) {
  console.error(`Could not scan ${DIST}: ${err.message}. Run \`npm run build\` first.`);
  process.exit(2);
}

if (scanned === 0) {
  console.error("Nothing to scan: dist/ is empty. Run `npm run build` first.");
  process.exit(2);
}
if (failed) {
  console.error("\nThe build exposes something that must stay on the server. Never read `import.meta.env` as a whole object, and never put secrets in VITE_* variables.");
  process.exit(1);
}
console.log(`Bundle scan passed (${scanned} files, no secret-like content).`);
