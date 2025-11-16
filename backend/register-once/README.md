# Entity Secret Registration Script

This script generates an Entity Secret, registers it with Circle, and creates a Wallet Set for your ArcRelay backend.

## Prerequisites

1. Node.js installed
2. Circle API Key from [Circle Developer Console](https://console.circle.com)
3. `.env` file in the backend root with `CIRCLE_API_KEY` set

## Usage

1. **Set up environment variable**:
   ```bash
   # In backend/.env file, add:
   CIRCLE_API_KEY=your-circle-api-key
   ```

2. **Run the script**:
   ```bash
   cd backend
   node register-once/register-entity.js
   ```

## What it does

1. **Generates Entity Secret**: Creates a 32-byte hex string Entity Secret
2. **Registers Entity Secret**: Encrypts and registers it with Circle
3. **Saves Recovery File**: Stores recovery file in `register-once/recovery/` directory
4. **Creates Wallet Set**: Creates a new Wallet Set for your application

## Output

The script outputs:
- Entity Secret (save this securely!)
- Recovery file location
- Wallet Set ID (add to your `.env` file)

## Important Security Notes

⚠️ **You are solely responsible for securing your Entity Secret and recovery file:**

- Store your Entity Secret securely (e.g., in a password manager)
- Save the recovery file in a safe, separate location
- Circle does NOT store your Entity Secret and cannot recover it
- The recovery file is the only way to reset your Entity Secret if lost

## Next Steps

After running this script:

1. Add the Entity Secret to your `.env` file:
   ```
   CIRCLE_ENTITY_SECRET=<generated-entity-secret>
   CIRCLE_WALLET_SET_ID=<wallet-set-id>
   ```

2. Store the recovery file in a secure location (separate from your codebase)

3. You can now use the Circle SDK in your backend to create wallets and manage transactions

## References

- [Register Entity Secret Documentation](https://developers.circle.com/wallets/dev-controlled/register-entity-secret)
- [Create Your First Wallet Documentation](https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet)

