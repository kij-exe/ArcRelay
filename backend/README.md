# ArcRelay Backend Server

A TypeScript backend server for managing Circle developer-controlled wallets. Users can register, create wallets, query balances across multiple blockchains, and process token transfers.

## Features

- User authentication with JWT tokens
- Developer-controlled wallet creation via Circle SDK
- Multi-blockchain balance querying
- Token transfer transaction processing
- PostgreSQL database for data persistence
- Modular architecture with files under 200 lines

## Prerequisites

- Node.js 18+ 
- Circle API credentials (API Key, Entity Secret, Wallet Set ID)

## Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Database credentials
- Circle API credentials
- JWT secret

3. Set up the database:
```bash
# Create PostgreSQL database (assumes PostgreSQL is running on port 5432)
createdb arcrelay

# Apply the schema from src/db/schema.sql
psql arcrelay < src/db/schema.sql
```

## Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

The server will run on `http://localhost:3000` by default.

## API Documentation

See [API_SPECIFICATION.md](./API_SPECIFICATION.md) for complete API documentation.

## Project Structure

```
src/
├── db/
│   ├── connection.ts      # PostgreSQL connection pool
│   └── schema.sql         # Database schema
├── models/
│   ├── User.ts            # User model and database operations
│   ├── Wallet.ts          # Wallet model and database operations
│   └── Transaction.ts     # Transaction model and database operations
├── services/
│   └── circleClient.ts    # Circle SDK client initialization
├── middleware/
│   ├── auth.ts            # JWT authentication middleware
│   ├── errorHandler.ts    # Global error handler
│   └── validation.ts      # Request validation middleware
├── routes/
│   ├── auth.ts            # Authentication routes
│   ├── wallets.ts         # Wallet management routes
│   ├── balances.ts        # Balance querying routes
│   └── transactions.ts    # Transaction processing routes
├── utils/
│   └── auth.ts            # JWT and password utilities
└── index.ts               # Main server file
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `JWT_SECRET`: Secret key for JWT tokens
- `JWT_EXPIRES_IN`: JWT token expiration (default: 7d)
- `DB_HOST`: PostgreSQL host
- `DB_PORT`: PostgreSQL port
- `DB_NAME`: Database name
- `DB_USER`: Database user
- `DB_PASSWORD`: Database password
- `CIRCLE_API_KEY`: Circle API key
- `CIRCLE_ENTITY_SECRET`: Circle entity secret
- `CIRCLE_WALLET_SET_ID`: Circle wallet set ID

## Supported Blockchains

- Ethereum (ETH, ETH-SEPOLIA)
- Polygon (MATIC, MATIC-AMOY)
- Base (BASE, BASE-SEPOLIA)
- Arbitrum (ARB, ARB-SEPOLIA)
- Optimism (OP, OP-SEPOLIA)
- Avalanche (AVAX, AVAX-FUJI)
- Solana (SOL, SOL-DEVNET)
- Aptos (APTOS, APTOS-TESTNET)
- Unichain (UNI, UNI-SEPOLIA)
- Arc (ARC-TESTNET)

## License

ISC

