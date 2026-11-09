# Deploying to Sepolia and Railway

This puts the contract on the Sepolia testnet and the app on Railway, so people on any machine can open one HTTPS
address and share the same roles, cases and evidence.

> **Sepolia is public and for testing only.** Every officer's wallet address, and when it acted on which evidence, is
> public and permanent on a public chain. Do not use real cases. Production needs a permissioned or private network
> (roadmap decision D6).

## What the server enforces

The API reads each signed-in wallet's role from the contract (`server/chainRoles.js`) and refuses what that role may
not do:

| Endpoint | Who may use it |
|---|---|
| `POST /api/pin`, `POST /api/keys`, creating and editing cases | Investigator |
| `GET /api/keys/:id` (decryption keys), reading cases | any role |
| Listing and resolving access requests | Chief or Admin (Admin requests: Chief only) |
| Submitting and reading your own access request | any signed-in wallet |

A production server with no contract configured grants nothing; one with a contract but no `RPC_URL` refuses
everything. Only `npm run dev` on the demo ledger skips these checks.

## 1. Deploy the contract to Sepolia (you run this)

You need:

- **A throwaway MetaMask account** used only to deploy. Never use the key of a wallet that holds real funds.
- **Sepolia test ETH** in that account from a faucet (for example Google Cloud's or Alchemy's Sepolia faucet). A
  deployment costs well under 0.05 test ETH.
- **A Sepolia RPC URL** from Alchemy or Infura (free account).
- **Your Chief wallet address**: the MetaMask account that will manage roles. It needs a little Sepolia ETH too,
  because granting a role is a transaction.

In `contracts/`:

```bash
npm install
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set DEPLOYER_PRIVATE_KEY
```

Hardhat asks for a keystore password, then each value. They are stored encrypted, never in a file in the repo.

Deploy, making your own wallet the Chief (PowerShell):

```powershell
$env:ADMIN_ADDRESS = "0xYourChiefWallet"; npx hardhat run scripts/deploy.ts --network sepolia
```

The script prints three values. Keep them for step 2:

```
VITE_LOCKER_ADDRESS=0x...
VITE_LOCKER_DEPLOY_BLOCK=...
VITE_CHAIN_ID=11155111
```

With `ADMIN_ADDRESS` set, the script cannot grant other roles; the Chief grants them on the Role Management page once
the app is live.

## 2. Create the Railway service

1. Push this branch to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** → `Digital-Forensics-Locker`, and pick the branch.
   `railway.json` sets the build (`npm run build && npm run check:bundle`) and start (`npm start`) commands.
3. **Add a volume** to the service, mounted at `/data`. The evidence key store lives there: without a volume it is
   wiped on every deploy, and every encrypted file becomes unreadable.
4. **Variables** (service → Variables):

   | Variable | Value |
   |---|---|
   | `VITE_LOCKER_ADDRESS` | from step 1 |
   | `VITE_LOCKER_DEPLOY_BLOCK` | from step 1 |
   | `VITE_CHAIN_ID` | `11155111` |
   | `RPC_URL` | your Sepolia RPC URL (server-side only) |
   | `PINATA_JWT` | your Pinata JWT (server-side only) |
   | `EVIDENCE_MASTER_KEY` | a **new** key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `EVIDENCE_MASTER_KEY_VERSION` | `1` |
   | `DATA_DIR` | `/data` |

   Do **not** set any `VITE_DEMO_*` variable. Never give a secret a `VITE_` prefix: those are copied into the public
   bundle (the build's `check:bundle` step fails if it spots one).

   **Back up `EVIDENCE_MASTER_KEY` somewhere other than Railway.** Losing it makes every encrypted file unreadable.
5. **Settings → Networking → Generate Domain.** Railway gives the service an `https://….up.railway.app` address with a
   real certificate, and sets `RAILWAY_PUBLIC_DOMAIN`, which the server accepts as its host. For your own domain, add
   it in Railway and also set `ALLOWED_HOSTS=your.domain`.
6. Redeploy after changing any `VITE_*` variable: they are built into the page.

## 3. Check it

1. Open the Railway address. You should see the sign-in page with no certificate warning.
2. In MetaMask, switch to the **Sepolia** network, connect your Chief wallet and sign. You should land on Role
   Management with the Chief badge.
3. From another machine, connect a wallet with no role: it sees the access request form. Send a request.
4. On your machine, approve it on Role Management (a Sepolia transaction from the Chief wallet).
5. The other machine opens the case dashboard by itself once the role is on chain.
6. An Investigator registers a test file (they need a little Sepolia ETH); an Auditor on a third machine sees it.

## Known limits

- **Sign-in sessions are kept in the server's memory.** A restart or redeploy signs everyone out, and the service
  must run as a single replica (`railway.json` sets `numReplicas: 1`).
- **The stores are JSON files on the volume**, written by one process. Fine for a pilot, not for heavy use.
- **Role changes reach the server within 15 seconds** (`ROLE_CACHE_MS`); the contract rejects unauthorised writes
  immediately.
- **Any wallet with a role can fetch any decryption key.** There are no per-case access lists yet.
