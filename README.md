# Digital Forensics Locker (Demo)

A **front-end demo** of a digital-evidence chain-of-custody workflow. It shows what the screens could look like, using fictional sample data. It is **not** an evidence system: nothing is stored, signed, anchored or access-controlled, and it must not be used for real evidence.

## What exists

| Feature | What it really does |
| --- | --- |
| UI (Dashboard, Evidence Upload, Evidence Viewer, Chain of Custody, Case Management) | React 19 + Vite 8 single-page app with client-side routing (`react-router-dom`), styled mostly with inline styles plus a small amount of Tailwind v4 CSS. |
| Sample data | Cases, evidence items, custody events, wallet addresses, hashes, IPFS CIDs and transaction hashes are **fictional** and live in `src/data/mockData.js`. |
| SHA-256 hashing | The upload wizard hashes the chosen file **in your browser** with the Web Crypto API (`crypto.subtle`, needs HTTPS or localhost). The file is not sent anywhere. |
| MetaMask account display | "Connect MetaMask" reads the selected account from an injected wallet (`eth_requestAccounts`) and shows it. This only says *which account the browser reports*. It is **not** authentication or authorization: no signature is requested or checked. |
| PDF report | The custody report is generated in the browser with jsPDF from the sample data. It carries a "demo, not evidence-grade" disclaimer. |
| Demo labelling and accessibility basics | A persistent "demo, not evidence-grade" banner on every page, a global keyboard focus ring and `prefers-reduced-motion` support (see `src/index.css`). |

## What does NOT exist

- **No smart contract and no on-chain anchoring.** There is no Solidity code, no deployment and no transaction. Transaction hashes and block numbers shown in the UI are sample values.
- **No IPFS / Pinata upload.** Uploading is disabled. A real upload needs a server-side proxy so that no API secret ships in the browser bundle (see [Security notes](#security-notes)).
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

## Security notes

- **Never put secrets in `VITE_*` variables.** Vite inlines every `VITE_*` value into the public JavaScript bundle, so anyone who loads the site can read it. See `.env.example`.
- **Rotate any key that was ever in a `VITE_*` variable** (for example a Pinata JWT or API key used by an earlier version of this project). Assume it is compromised, including anything in a deployed build or in git history, and revoke it at the provider.
- `.env` and `.env.*` are git-ignored (only `.env.example` is tracked). Do not commit real values.
- The MetaMask connection is display-only. Do not treat a connected address as proof of identity.
- Any future upload must go through a server-side proxy that holds scoped credentials and authenticates the caller.

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
