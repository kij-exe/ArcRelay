# How to Run the Server

## Prerequisites

1. **Node.js 18+** installed
2. **Docker and Docker Compose** installed (for database)
3. **Circle API credentials** (API Key, Entity Secret, Wallet Set ID)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

```bash
cp env.example .env
```

Edit `.env` and set your values:
- **Circle SDK credentials** (required):
  - `CIRCLE_API_KEY`
  - `CIRCLE_ENTITY_SECRET`
  - `CIRCLE_WALLET_SET_ID`
- **JWT Secret** (change from default):
  - `JWT_SECRET`
- **Database connection** (if running locally):
  - `DB_HOST=localhost` (use `db` when connecting from docker-compose network)
  - `DB_PORT=5432`
  - `DB_NAME`, `DB_USER`, `DB_PASSWORD` should match `POSTGRES_*` values

### 3. Start the Database

```bash
docker-compose up -d
```

This will:
- Start PostgreSQL container on port 5432
- Automatically apply the schema from `postgresql/schema.sql`
- Create the database with the credentials from `.env`

Wait a few seconds for the database to be ready. Check status:
```bash
docker-compose ps
```

### 4. Run the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## Verify Everything Works

1. **Check database connection**:
   ```bash
   docker-compose exec db psql -U postgres -d arcrelay -c "\dt"
   ```
   Should show the `users` table.

2. **Check server health**:
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"status":"ok","timestamp":"..."}`

3. **Test user registration**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

## Troubleshooting

### Database Connection Issues

- **If running locally**: Make sure `DB_HOST=localhost` in `.env`
- **If connecting from another container**: Use `DB_HOST=db` (the docker-compose service name)
- **Check database is running**: `docker-compose ps`
- **View database logs**: `docker-compose logs db`

### Port Already in Use

- Change `PORT` in `.env` to a different port
- Or change `POSTGRES_PORT` if port 5432 is taken

### Schema Not Applied

If the schema wasn't applied on first startup:
```bash
docker-compose down -v  # Remove volumes
docker-compose up -d    # Start fresh
```

Or manually apply:
```bash
docker-compose exec db psql -U postgres -d arcrelay -f /docker-entrypoint-initdb.d/01-schema.sql
```

## Stopping the Server

- **Stop server**: `Ctrl+C` (if running in terminal)
- **Stop database**: `docker-compose down`
- **Stop and remove volumes**: `docker-compose down -v` (⚠️ deletes all data)

