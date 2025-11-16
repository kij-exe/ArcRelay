# ArcRelay Backend API Specification

## Base URL
```
http://localhost:3000/api
```

## Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Endpoints

### 1. Authentication

#### Register User
**POST** `/auth/register`

Creates a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `409`: User already exists
- `400`: Validation error

---

#### Login
**POST** `/auth/login`

Authenticates a user and returns a JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `401`: Invalid credentials
- `400`: Validation error

---

### 2. Wallets

#### Create Wallets
**POST** `/wallets/create`

Creates developer-controlled wallets for the authenticated user across the supported blockchains. Wallets are automatically created for: AVAX-FUJI, HYPEREVM-TESTNET, and ARC-TESTNET.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
None (no request body required)

**Supported Blockchains:**
Wallets are automatically created for:
- `AVAX-FUJI`
- `HYPEREVM-TESTNET`
- `ARC-TESTNET`

**Response (201):**
```json
{
  "message": "Wallets created successfully",
  "walletSet": {
    "id": "c4d1da72-111e-4d52-bdbf-2e74a2d803d5",
    "createDate": "2024-01-01T12:04:05Z",
    "updateDate": "2024-01-01T12:04:05Z"
  },
  "wallets": [
    {
      "circleWalletId": "a635d679-4207-4e37-b12e-766afb9b3892",
      "blockchain": "BASE-SEPOLIA",
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "state": "LIVE"
    },
    {
      "circleWalletId": "b746e7f9-5318-5f48-c23f-877bgc0c4903",
      "blockchain": "ARB-SEPOLIA",
      "address": "0x853e46DdCc6634C0532925a3b844Bc9e7595f0bEc",
      "state": "LIVE"
    },
    {
      "circleWalletId": "c857f8ga-6429-6g59-d34g-988chd1d5a14",
      "blockchain": "ARC-TESTNET",
      "address": "0x964f57EeDd7755D154303a4b844Dd9e7596f1bFd",
      "state": "LIVE"
    }
  ]
}
```

**Error Responses:**
- `401`: Unauthorized
- `404`: User not found
- `409`: User already has wallets created
- `500`: Failed to create wallets

---

#### Get User Wallets
**GET** `/wallets`

Retrieves wallet information and aggregated USDC balances for the authenticated user.

Each user has one Circle wallet per supported blockchain: `AVAX-FUJI`, `HYPEREVM-TESTNET`, and `ARC-TESTNET`.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "walletSet": {
    "id": "c4d1da72-111e-4d52-bdbf-2e74a2d803d5",
    "createDate": "2024-01-01T12:04:05Z",
    "updateDate": "2024-01-01T12:04:05Z"
  },
  "walletSetId": "c4d1da72-111e-4d52-bdbf-2e74a2d803d5",
  "wallets": [
    {
      "circleWalletId": "a635d679-4207-4e37-b12e-766afb9b3892",
      "blockchain": "ETH-SEPOLIA",
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "state": "LIVE",
      "createDate": "2024-01-01T12:04:05Z",
      "updateDate": "2024-01-01T12:04:05Z",
      "usdcBalance": "10.000000"
    },
    {
      "circleWalletId": "b746e7f9-5318-5f48-c23f-877bgc0c4903",
      "blockchain": "BASE-SEPOLIA",
      "address": "0x853e46DdCc6634C0532925a3b844Bc9e7595f0bEc",
      "state": "LIVE",
      "createDate": "2024-01-01T12:04:05Z",
      "updateDate": "2024-01-01T12:04:05Z",
      "usdcBalance": "5.250000"
    },
    {
      "circleWalletId": "c857f8ga-6429-6g59-d34g-988chd1d5a14",
      "blockchain": "ARC-TESTNET",
      "address": "0x964f57EeDd7755D154303a4b844Dd9e7596f1bFd",
      "state": "LIVE",
      "createDate": "2024-01-01T12:04:05Z",
      "updateDate": "2024-01-01T12:04:05Z",
      "usdcBalance": null
    }
  ]
}
```

**Field details:**
- `walletSet`: Circle wallet set metadata (`id`, `createDate`, `updateDate`).
- `walletSetId`: convenience copy of the wallet set ID.
- `wallets[]`:
  - `circleWalletId`: Circle wallet ID.
  - `blockchain`: `AVAX-FUJI`, `HYPEREVM-TESTNET`, or `ARC-TESTNET`.
  - `address`: EVM address of the wallet.
  - `state`: `"LIVE"` or `"FROZEN"`.
  - `createDate`, `updateDate`: wallet timestamps (ISO 8601, UTC).
  - `usdcBalance`: string, aggregated USDC balance on that chain in human-readable format with up to 6 decimals (e.g. `"10.000000"`), or `null` if no USDC-like tokens are present.

**Error Responses:**
- `401`: Unauthorized
- `500`: Failed to fetch wallets

---

### 3. Balances

#### Get All Balances
**GET** `/balances`

Retrieves token balances for all wallets across all blockchains for the authenticated user.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "balances": [
    {
      "circleWalletId": "a635d679-4207-4e37-b12e-766afb9b3892",
      "blockchain": "BASE-SEPOLIA",
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "state": "LIVE",
      "balances": [
        {
          "amount": "100.5",
          "updateDate": "2024-01-01T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

**Error Responses:**
- `401`: Unauthorized
- `500`: Failed to fetch balances
---

### 4. Gateway Transfers

#### Create Gateway Transfer
**POST** `/gateway/transfer`

Initiates a cross-chain USDC transfer using Circle Gateway. This:
1. Queries all user wallets and their USDC balances
2. Selects a subset of wallets whose balances satisfy the requested amount
3. Deposits USDC from those wallets into the Gateway wallet contracts
4. Creates and signs burn intents using Circle's Developer-Controlled Wallets API
5. Submits signed burn intents to Circle's Gateway API to obtain attestations
6. Uses a relayer (configured via `RELAYER_PRIVATE_KEY`) to call the Gateway Minter on the destination chain and mint USDC to the destination address

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "amount": "10.5",
  "destinationAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "chain": "Avalanche",
  "network": "Fuji",
  "sourceWallets": ["Avalanche:Fuji", "ARC:Testnet"]
}
```

**Fields:**
- `amount` (string, required): Amount of USDC to transfer (human-readable, 6 decimals, e.g. `"10.5"`)
- `destinationAddress` (string, required): EVM address that will receive USDC on the destination chain
- `chain` (string, required): Destination chain. Supported values:
  - `"Avalanche"`
  - `"HyperEVM"`
  - `"ARC"`
- `network` (string, required): Destination network. Supported values:
  - `"Fuji"` for Avalanche
  - `"Testnet"` for HyperEVM / ARC
- `sourceWallets` (string[], optional): List of source wallets to use for funding the transfer.
  - Format: `"Chain:Network"`, e.g. `"Avalanche:Fuji"`, `"ARC:Testnet"`.
  - If omitted, **all** of the user's wallets are considered when selecting balances.

**Destination chain mapping:**
- `{ "chain": "Avalanche", "network": "Fuji" }` → `AVAX-FUJI`
- `{ "chain": "HyperEVM", "network": "Testnet" }` → `HYPEREVM-TESTNET`
- `{ "chain": "ARC", "network": "Testnet" }` → `ARC-TESTNET`

**Response (200):**
```json
{
  "message": "Gateway transfer initiated successfully",
  "depositTransactions": [
    "d4a5e0a1-1234-5678-9abc-def012345678"
  ],
  "mintTransactions": [
    "0xabc123...def456"
  ],
  "destinationBlockchain": "AVAX-FUJI",
  "destinationAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "amount": "10.5"
}
```

**Error Responses:**
- `400`:
  - Invalid request body (amount, address, chain/network)
  - Unsupported `chain` / `network` combination
  - No USDC balances found in user wallets
- `401`: Unauthorized (missing or invalid JWT)
- `404`: User has no wallet set
- `500`: Failed to process Gateway transfer

---

## Health Check

#### Health Check
**GET** `/health`

Returns server health status.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

For validation errors:
```json
{
  "error": "Validation error",
  "details": [
    {
      "path": ["fieldName"],
      "message": "Error message"
    }
  ]
}
```

---

## Notes

1. All timestamps are in ISO 8601 format (UTC)
2. Amounts are represented as strings to avoid precision issues
3. The JWT token expires after 7 days (configurable via `JWT_EXPIRES_IN`)
4. Wallet creation automatically creates a wallet set for each user, then creates 3 wallets (one for each supported blockchain: AVAX-FUJI, HYPEREVM-TESTNET, ARC-TESTNET) linked to that wallet set
5. Each user can only create wallets once (subsequent requests will return 409 error)
6. All wallets for a user are managed through their wallet set
7. Transaction history is managed by Circle's API (not stored in our database)

