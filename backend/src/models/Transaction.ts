import { query } from '../db/connection';

export interface Transaction {
  id: number;
  user_id: number;
  wallet_id: number;
  circle_transaction_id: string;
  blockchain: string;
  token_address: string | null;
  amount: string;
  destination_address: string;
  state: string;
  ref_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTransactionInput {
  user_id: number;
  wallet_id: number;
  circle_transaction_id: string;
  blockchain: string;
  token_address?: string | null;
  amount: string;
  destination_address: string;
  state: string;
  ref_id?: string | null;
}

export const createTransaction = async (input: CreateTransactionInput): Promise<Transaction> => {
  const result = await query(
    `INSERT INTO transactions (user_id, wallet_id, circle_transaction_id, blockchain, 
     token_address, amount, destination_address, state, ref_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      input.user_id,
      input.wallet_id,
      input.circle_transaction_id,
      input.blockchain,
      input.token_address || null,
      input.amount,
      input.destination_address,
      input.state,
      input.ref_id || null,
    ]
  );
  return result.rows[0];
};

export const getTransactionsByUserId = async (user_id: number): Promise<Transaction[]> => {
  const result = await query(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC',
    [user_id]
  );
  return result.rows;
};

export const getTransactionByCircleId = async (
  circle_transaction_id: string
): Promise<Transaction | null> => {
  const result = await query(
    'SELECT * FROM transactions WHERE circle_transaction_id = $1',
    [circle_transaction_id]
  );
  return result.rows[0] || null;
};

export const updateTransactionState = async (
  circle_transaction_id: string,
  state: string
): Promise<Transaction | null> => {
  const result = await query(
    `UPDATE transactions SET state = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE circle_transaction_id = $2 RETURNING *`,
    [state, circle_transaction_id]
  );
  return result.rows[0] || null;
};

