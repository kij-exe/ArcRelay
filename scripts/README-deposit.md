# User Deposit Scripts

## Overview

We now have two different payment flows:

### 1. X402 Pay-Per-Request (`pay.ts`)
- **Purpose**: Pay for API access using the X402 protocol
- **Recipient**: Facilitator wallet (`0x841eed4b3a65c0b2983ccb835d7e2bf4eabe527b`)
- **Use case**: When you want to access paid API endpoints

### 2. User Wallet Deposit (`deposit-to-user.ts`)
- **Purpose**: Deposit USDC directly to a user's Circle wallet
- **Recipient**: User's Circle wallet (e.g., `0x762edd85d411f8389966de91a92dd9d6d10d8cc2`)
- **Use case**: When users want to add funds to their Circle wallets for withdrawals

## How to Use the Deposit Script

### Prerequisites

1. You need a wallet with testnet USDC on Base Sepolia
2. Get testnet USDC from: https://faucet.circle.com/

### Running the Script

```bash
# Set your private key (must have USDC)
export PAYER_PK="0x_your_private_key_here"

# Run the deposit script
npx tsx scripts/deposit-to-user.ts
```

### What Happens

1. The script requests deposit requirements from `/deposit/requirements`
2. It creates an EIP-3009 authorization to transfer USDC
3. Signs the authorization with your private key
4. Submits to `/deposit/settle`
5. USDC is transferred directly to the user's Circle wallet

### Key Differences

| Script | Endpoint | Recipient | Purpose |
|--------|----------|-----------|---------|
| `pay.ts` | `/settle` | Facilitator wallet | API payments |
| `deposit-to-user.ts` | `/deposit/settle` | User's wallet | User deposits |

## Customization

To deposit to a different user's wallet, edit line 11 in `deposit-to-user.ts`:

```typescript
const USER_WALLET_ADDRESS = '0x_target_wallet_address' as Address;
```

To change the deposit amount, edit line 13:

```typescript
const AMOUNT_USDC = '10.0'; // Amount in USDC
```

## Testing

1. First, check your user's wallet balance on the withdraw page
2. Run the deposit script
3. Refresh the withdraw page - the balance should update
4. The USDC goes directly to the user's wallet, not the facilitator

## Troubleshooting

- **"Set PAYER_PK in env"**: Export your private key with `export PAYER_PK="0x..."`
- **"Insufficient balance"**: Get testnet USDC from the faucet
- **"Network error"**: Ensure the facilitator is running (`npm run facilitator`)