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

Creates developer-controlled wallets for the authenticated user across all supported blockchains. Wallets are automatically created for: BASE-SEPOLIA, ARB-SEPOLIA, and ARC-TESTNET.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
None (no request body required)

**Supported Blockchains:**
Wallets are automatically created for:
- `BASE-SEPOLIA`
- `ARB-SEPOLIA`
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

Retrieves wallet information for the authenticated user.

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
      "blockchain": "BASE-SEPOLIA",
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "state": "LIVE",
      "createDate": "2024-01-01T12:04:05Z",
      "updateDate": "2024-01-01T12:04:05Z"
    }
  ]
}
```

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

#### Get Wallet Balance
**GET** `/balances/:walletId`

Retrieves token balances for a specific wallet.

**Headers:**
```
Authorization: Bearer <token>
```

**Path Parameters:**
- `walletId` (string): The Circle wallet ID

**Response (200):**
```json
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
```

**Error Responses:**
- `401`: Unauthorized
- `404`: Wallet not found
- `500`: Failed to fetch wallet balance

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
4. Wallet creation automatically creates a wallet set for each user, then creates 3 wallets (one for each supported blockchain: BASE-SEPOLIA, ARB-SEPOLIA, ARC-TESTNET) linked to that wallet set
5. Each user can only create wallets once (subsequent requests will return 409 error)
6. All wallets for a user are managed through their wallet set
7. Transaction history is managed by Circle's API (not stored in our database)