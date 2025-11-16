import { query } from '../db/connection';

export interface Wallet {
  id: number;
  user_id: number;
  circle_wallet_id: string;
  blockchain: string;
  address: string;
  wallet_set_id: string;
  state: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWalletInput {
  user_id: number;
  circle_wallet_id: string;
  blockchain: string;
  address: string;
  wallet_set_id: string;
  state?: string;
}

export const createWallet = async (input: CreateWalletInput): Promise<Wallet> => {
  const state = input.state || 'LIVE';
  const result = await query(
    `INSERT INTO wallets (user_id, circle_wallet_id, blockchain, address, wallet_set_id, state)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.user_id, input.circle_wallet_id, input.blockchain, input.address, input.wallet_set_id, state]
  );
  return result.rows[0];
};

export const getWalletsByUserId = async (user_id: number): Promise<Wallet[]> => {
  const result = await query('SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at DESC', [user_id]);
  return result.rows;
};

export const getWalletByCircleId = async (circle_wallet_id: string): Promise<Wallet | null> => {
  const result = await query('SELECT * FROM wallets WHERE circle_wallet_id = $1', [circle_wallet_id]);
  return result.rows[0] || null;
};

export const getWalletById = async (id: number): Promise<Wallet | null> => {
  const result = await query('SELECT * FROM wallets WHERE id = $1', [id]);
  return result.rows[0] || null;
};

export const getUserWalletByBlockchain = async (
  user_id: number,
  blockchain: string
): Promise<Wallet | null> => {
  const result = await query(
    'SELECT * FROM wallets WHERE user_id = $1 AND blockchain = $2',
    [user_id, blockchain]
  );
  return result.rows[0] || null;
};

