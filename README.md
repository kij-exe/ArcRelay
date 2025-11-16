# ArcRelay x402 Gateway – Project Overview

A full x402-style payment gateway and developer dashboard that lets API providers monetize their endpoints using USDC. The system runs a proxy in front of any REST API, returns HTTP 402 “Payment Required” with multi-chain payment options, verifies and settles payments using Circle Developer‑Controlled Wallets (DCW), and provides a dashboard for pricing, balances and withdrawals via Circle Gateway.

## What’s in this repo

- Proxy (TypeScript/Express) – sits in front of your API, returns 402, verifies/settles via the facilitator, manages `config.json` derived from your OpenAPI.
- Facilitator (TypeScript/Express) – integrates Circle DCW to submit onchain transfers and exposes chain metadata for the proxy.
- Frontend (Next.js + Tailwind) – developer dashboard (Pricing, Withdraw, Dashboard) protected by JWT.
- Example backend (FastAPI) – for local testing of a target API and example OpenAPI.
- Scripts – local utilities to test end‑to‑end flows (e.g., `scripts/pay.ts`, `scripts/deposit-to-user.ts`).

## Core concepts

- x402 Payment Flow: Client calls your API → Proxy returns 402 with offers (one per supported network) → Client signs EIP‑712 (EIP‑3009 TransferWithAuthorization) → Proxy verifies/settles through the facilitator → Proxy forwards the paid request upstream.
- Circle DCW: Custodial wallets per developer; the facilitator uses DCW to execute transfers and holds the developer’s receiving wallets.
- Circle Gateway: Unified USDC balance across chains; Withdraw page initiates cross‑chain transfers using a backend `POST /gateway/transfer`.

## Architecture

```
Client (SDK/script/browser)
     |
     v
Proxy (src/proxy/server.ts)  <-->  Facilitator (src/facilitator/server.ts)  <-->  Circle DCW / Gateway
     |
     v
Upstream API (your service)
```

- Proxy
  - Reads your `openapi.json`, bootstraps `config.json` with endpoints (price initially null).
  - Returns 402 with accepts for each facilitator‑supported network.
  - Verifies and optionally settles via facilitator, then proxies upstream.
  - JWT‑protected `GET/POST /config` used by the frontend Pricing page.
  - No “docs” routes; only `/openapi.json` is served for reference.
  - Builds `outputSchema` in 402 from your OpenAPI (best‑effort).
  - Multi‑chain: emits an `accepts[]` entry per network reported by the facilitator.

- Facilitator
  - Initializes supported networks (USDC address/name/version, Circle wallet id/address per chain).
  - `/verify` + `/settle` implement the EIP‑3009 verification/signature path and DCW submission.
  - `/networks` returns the chain metadata that the proxy caches.
  - Note: Some testnet tokens (e.g., Avalanche Fuji USDC.e) do not support EIP‑3009; use ERC‑20 transfer path (to be implemented) or use chains with USDC v2/EIP‑3009 support for settlement tests.

- Frontend (Next.js)
  - Auth (login/register/Google) with JWT; protected pages use an AuthGuard.
  - Dashboard
    - Derives stats client‑side from `/wallets` (balances) and proxy `/config` (active endpoints).
    - Shows a Wallets panel (per‑chain address, status, and USDC balance).
  - Pricing
    - Reads and writes proxy `/config` (JWT bearer).
    - Editable price/timeout/active/autosettle; supports all facilitator networks.
  - Withdraw
    - Reads `/wallets` to show aggregated USDC.
    - Submits `POST /gateway/transfer` with { amount, destinationAddress, chain, network }.
    - Chain mappings include: Arc Testnet, Base Sepolia, Ethereum Sepolia, Avalanche Fuji.

## Supported networks (current)

- Ethereum Sepolia (`ETH-SEPOLIA`)
- Base Sepolia (`BASE-SEPOLIA`)
- Arc Testnet (`ARC-TESTNET`)
- Avalanche Fuji (`AVAX-FUJI`) – note EIP‑3009 not supported by USDC.e; use Gateway/standard transfers
<!-- HyperEVM Testnet removed -->

You can extend networks in `src/chains/index.ts` and expose them via the facilitator.

## Installation

Prerequisites:
- Node 18+, npm 
- Circle API credentials for DCW/Gateway

Install:
```
npm install
cd frontend && npm install 
```

## Environment variables

Create `.env` at the repo root (not committed):


# Facilitator / Circle
```
CIRCLE_API_KEY=YOUR_API_KEY
CIRCLE_ENTITY_SECRET=YOUR_ENTITY_SECRET_KEY
CIRCLE_WALLET_SET_ID=YOUR_WALLET_SET_ID
CIRCLE_DCW_API_URL=https://api.circle.com
```

# Proxy paths
```
X402_OPENAPI_PATH=backend-client-examples/fastapi/specs/openapi.json
X402_CONFIG_PATH=backend-client-examples/fastapi/specs/config.json
```

# RPC URLs and token addresses
```
ETHEREUM_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ETHEREUM_SEPOLIA_USDC_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
ETHEREUM_SEPOLIA_USDC_NAME=USDC
ETHEREUM_SEPOLIA_USDC_VERSION=2

BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
BASE_SEPOLIA_USDC_NAME=USDC
BASE_SEPOLIA_USDC_VERSION=2

ARC_TESTNET_RPC_URL=https://rpc-testnet.archon.foundation
ARC_TESTNET_USDC_ADDRESS=0x3600000000000000000000000000000000000000
ARC_TESTNET_USDC_NAME=USDC
ARC_TESTNET_USDC_VERSION=2

AVALANCHE_FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
AVALANCHE_FUJI_USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
AVALANCHE_FUJI_USDC_NAME=USDC
AVALANCHE_FUJI_USDC_VERSION=2
```

Frontend - frontend/.env.local:
```
# our deployed backend
NEXT_PUBLIC_BACKEND_URL=http://srv1110170.hstgr.cloud:3000/api   
```

## Running locally

Facilitator (from root directory): 
``` 
npm run facilitator
```

Frontend: 
``` 
cd frontend
npm run dev
```

Proxy (from root directory): 
```
npm run proxy
```

API example:
```
cd backend-client-examples
cd fastapi
pip intall
uvicorn main:app --host 0.0.0.0 --port 8080 --reload 
```

Client user script:
```
npx tsx scripts/deposit-to-user.ts
```

## Config/Pricing lifecycle

1) Provide an OpenAPI spec at `X402_OPENAPI_PATH`.
2) On first run, the proxy generates `config.json` with endpoint skeletons (price null).
3) Open the dashboard → Pricing, set prices/timeouts/toggles, Save (POST `/config`).
4) Proxy uses facilitator `/networks` to return multi‑chain 402 offers.

## End‑to‑end testing

- Deposit to a user wallet (testing balances):
  ```
  export PAYER_PK=0x...
  npx tsx scripts/deposit-to-user.ts
  ```
  On chains with USDC v2 (EIP‑3009), the flow verifies successfully. Use Gateway transfers or implement an ERC‑20 transfer path in the facilitator for deposits.

## Withdrawals (Gateway)

- Frontend calls `POST /gateway/transfer` on your backend with:
  ```
  {
    "amount": "10.5",
    "destinationAddress": "0x..",
    "chain": "Base" | "ETH" | "ARC" | "Avalanche",
    "network": "Sepolia" | "Testnet" | "Fuji"
  }
  ```
- The backend aggregates from `/wallets`, moves funds into Gateway, and mints on the destination chain using Circle Gateway.
- The dashboard’s Withdraw page derives balances from `GET /wallets`:
  ```
  {
    walletSet: {...},
    walletSetId: "...",
    wallets: [{ blockchain, address, state, usdcBalance }]
  }
  ```

## Authentication

- All admin endpoints (frontend → backend/proxy) use JWT bearer in `Authorization`.
- Proxy: `GET/POST /config` require bearer only (no `X-Admin-Token`).
- Frontend’s AuthGuard checks local JWT and redirects to `/login` if missing.

## Troubleshooting

- 404 on `/auth/*` / double slashes: set `NEXT_PUBLIC_BACKEND_URL` to the `/api` root without trailing slash.
- Hydration mismatch: AuthGuard renders a stable placeholder and checks `localStorage` after mount; hard reload after changing auth logic.
- Circle 400 “insufficient funds”: Fund the DCW wallet on the target network or lower the price/amount.
- “Invalid EIP‑3009 signature”: Verify domain (name/version/chainId/verifyingContract) matches the USDC token on the selected chain; avoid Fuji for EIP‑3009.
- “Unsupported network”: Ensure envs (RPC/USDC) are set and the facilitator prints the network in “Active facilitator networks”.
