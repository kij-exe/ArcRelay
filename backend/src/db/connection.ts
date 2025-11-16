import { Pool } from 'pg';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'arcrelay',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error', { text, error });
    throw error;
  }
};

export const getClient = () => {
  return pool.connect();
};

export interface User {
  uuid: string;
  email: string;
  password_hash: string;
  circle_wallet_set_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  email: string;
  password_hash: string;
}

export const addUser = async (input: CreateUserInput): Promise<User> => {
  const uuid = uuidv4();
  const result = await query(
    'INSERT INTO users (uuid, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
    [uuid, input.email, input.password_hash]
  );
  return result.rows[0];
};

export const getUser = async (uuid: string): Promise<User | null> => {
  const result = await query('SELECT * FROM users WHERE uuid = $1', [uuid]);
  return result.rows[0] || null;
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
};

export const getUserByUuid = async (uuid: string): Promise<User | null> => {
  const result = await query('SELECT * FROM users WHERE uuid = $1', [uuid]);
  return result.rows[0] || null;
};

export const updateUserWalletSetId = async (
  uuid: string,
  circleWalletSetId: string
): Promise<User | null> => {
  const result = await query(
    'UPDATE users SET circle_wallet_set_id = $1, updated_at = CURRENT_TIMESTAMP WHERE uuid = $2 RETURNING *',
    [circleWalletSetId, uuid]
  );
  return result.rows[0] || null;
};

export default pool;

