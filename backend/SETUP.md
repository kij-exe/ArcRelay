# Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Set Up Database**
   ```bash
   # Create PostgreSQL database (assumes PostgreSQL is running on port 5432)
   createdb arcrelay
   
   # Apply the schema
   psql arcrelay < src/db/schema.sql
   
   # Or using psql:
   # psql -U postgres
   # CREATE DATABASE arcrelay;
   # \c arcrelay
   # (paste contents of src/db/schema.sql)
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## Environment Variables Required

Make sure to set these in your `.env` file:

```env
# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=arcrelay
DB_USER=postgres
DB_PASSWORD=postgres

# Circle SDK (Get these from Circle Developer Console)
CIRCLE_API_KEY=your-circle-api-key
CIRCLE_ENTITY_SECRET=your-circle-entity-secret
CIRCLE_WALLET_SET_ID=your-wallet-set-id
```

## Getting Circle Credentials

1. Sign up at [Circle Developer Console](https://console.circle.com)
2. Create a new application
3. Navigate to API Keys section
4. Create a new API key and entity secret
5. Create a wallet set and note the Wallet Set ID

## Testing the API

### 1. Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 2. Create Wallets
```bash
curl -X POST http://localhost:3000/api/wallets/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "blockchains": ["ETH-SEPOLIA", "MATIC-AMOY"],
    "count": 1
  }'
```

### 3. Get Balances
```bash
curl -X GET http://localhost:3000/api/balances \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Create Transaction
```bash
curl -X POST http://localhost:3000/api/transactions/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "walletId": 1,
    "blockchain": "ETH-SEPOLIA",
    "tokenAddress": "",
    "amount": "0.01",
    "destinationAddress": "0xa51c9c604b79a0fadbfed35dd576ca1bce71da0a",
    "feeLevel": "MEDIUM"
  }'
```

## Project Structure

```
src/
├── db/              # Database connection and schema
├── models/          # Data models (User, Wallet, Transaction)
├── services/        # External service clients (Circle SDK)
├── middleware/      # Express middleware (auth, validation, error handling)
├── routes/          # API route handlers
├── utils/           # Utility functions (JWT, password hashing)
└── index.ts         # Main server entry point
```

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Verify credentials in `.env`
- Check database exists: `psql -l | grep arcrelay`

### Circle SDK Errors
- Verify API credentials are correct
- Check Wallet Set ID exists in Circle console
- Ensure you're using testnet blockchains for testing

### Port Already in Use
- Change `PORT` in `.env`
- Or kill the process: `lsof -ti:3000 | xargs kill`

