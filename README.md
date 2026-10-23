# Digital Forensics Locker (Demo)

A **front-end demo** of a digital-evidence chain-of-custody workflow. It shows what the screens could look like, using fictional sample data. It is **not** an evidence system: nothing is stored, signed, anchored or access-controlled, and it must not be used for real evidence.

## What exists

| Feature | What it really does |
| --- | --- |
| UI (Dashboard, Evidence Upload, Evidence Viewer, Chain of Custody, Case Management) | React 19 + Vite 8 single-page app with client-side routing (`react-router-dom`), styled mostly with inline styles plus a small amount of Tailwind v4 CSS. |
| Sample data | Cases, evidence items, custody events, wallet addresses, hashes, IPFS CIDs and transaction hashes are **fictional** and live in `src/data/mockData.js`. |
| SHA-256 hashing | The upload wizard hashes the chosen file **in your browser** with the Web Crypto API (`crypto.subtle`, needs HTTPS or localhost). Hashing sends nothing anywhere. |
| IPFS upload (optional) | "Upload to IPFS" posts the file to `/api/pin`, a small server-side proxy (`server/pinataProxy.js`, mounted by `vite.config.js` on the dev and preview servers) that holds the Pinata JWT and pins the file via Pinata. The browser never sees the credential. Pinned files are **public and unencrypted**. See [IPFS upload setup](#ipfs-upload-setup). |
| MetaMask account display | "Connect MetaMask" reads the selected account from an injected wallet (`eth_requestAccounts`) and shows it. This only says *which account the browser reports*. It is **not** authentication or authorization: no signature is requested or checked. |
| PDF report | The custody report is generated in the browser with jsPDF from the sample data. It carries a "demo, not evidence-grade" disclaimer. |
| Demo labelling and accessibility basics | A persistent "demo, not evidence-grade" banner on every page, a global keyboard focus ring and `prefers-reduced-motion` support (see `src/index.css`). |

## What does NOT exist

- **No smart contract and no on-chain anchoring.** There is no Solidity code, no deployment and no transaction. Transaction hashes and block numbers shown in the UI are sample values.
- **No hosted upload service.** The proxy runs inside the Vite dev/preview servers. A deployed site needs the same handler mounted on a real server or serverless function (see [IPFS upload setup](#ipfs-upload-setup)).
- **No encryption and no access control on pinned files.** Anyone with a CID can read what you pinned.
- **No real access control.** There are no users, roles, officer allowlists or sessions. Anyone who opens the app sees everything.
- **No persistence.** All state is in memory and resets on reload. There is no backend and no database.
- **No tamper evidence.** Hashes shown for sample evidence are not checked against anything.

## Getting started

Requires Node.js 22 (the CI version) or any release supported by Vite 8.

```bash
npm install
npm run dev      # start the dev server (Vite)
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | Run ESLint over the project. |
| `npm test` | Run the Vitest + Testing Library suite once (`vitest run`). |

CI (`.github/workflows/ci.yml`) runs install, lint, test and build on every push and pull request.

## IPFS upload setup

1. Create a **new** Pinata API key (JWT) with only the `pinFileToIPFS` permission.
2. Put it in `.env` as `PINATA_JWT=...` (**no `VITE_` prefix**), then restart `npm run dev`. The proxy still accepts the legacy `VITE_PINATA_JWT` name for now and prints a warning, but that name is a leak waiting to happen.
3. Open the Evidence Upload page, choose a file, and click **Upload to IPFS**. If the key is missing or wrong the page shows the server's error and the wizard keeps working without a CID.

What the proxy enforces (`server/pinataProxy.js`): POST only, `multipart/form-data` only, 10 MB cap, a required `X-Requested-With` header (blocks cross-site form posts), same-origin `Origin` check, 30 s upstream timeout, and errors that never echo the token. It has **no user authentication**, so do not expose a dev or preview server to an untrusted network; anyone who can reach `/api/pin` can spend your Pinata quota.

For a deployed site, mount `handlePinRequest(req, res, { jwt })` from `server/pinataProxy.js` on your own Node server or serverless function and add real authentication first. That deployment is not included.

## Security notes

- **Never put secrets in `VITE_*` variables.** Vite inlines every `VITE_*` value into the public JavaScript bundle, so anyone who loads the site can read it. See `.env.example`.
- **Rotate any key that was ever in a `VITE_*` variable** (for example a Pinata JWT or API key used by an earlier version of this project). Assume it is compromised, including anything in a deployed build or in git history, and revoke it at the provider.
- `.env` and `.env.*` are git-ignored (only `.env.example` is tracked). Do not commit real values.
- The MetaMask connection is display-only. Do not treat a connected address as proof of identity.
- Uploads go through the server-side proxy, which holds the credential. The proxy does not yet authenticate callers (see [IPFS upload setup](#ipfs-upload-setup)).
- Files pinned to IPFS are public. Do not upload real evidence until client-side encryption exists.

## Roadmap

The open design questions (what "verified" should mean, who the users are, where keys live, what goes on chain) are laid out in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). It is a template for the project owner to complete; none of its mitigations are implemented yet.

Candidate directions, none committed: server-side upload proxy, wallet-signature login with an officer allowlist, an append-only hash-chained custody log, client-side encryption before any public storage, trusted timestamping.

## Known limitations

- Demo only. Not evidence-grade, not legally admissible, not reviewed by a forensics practitioner.
- All data is fictional and resets on reload.
- The wallet connection shows an address; it proves nothing about who is using the browser.
- File hashing runs in memory, so it suits modestly sized files only.
- A hash computed in the browser is not compared with any stored or published value.
- The PDF report contains sample data and is unsigned.
- No backend, no database, no audit trail that survives a page reload.
- Fonts load from Google Fonts at runtime (the app falls back to system fonts if blocked).
- No end-to-end or cross-browser testing beyond the unit/component tests in the repo.
