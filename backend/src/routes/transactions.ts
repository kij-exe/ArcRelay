import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { circleClient } from '../services/circleClient';
import { getUserByUuid } from '../db/connection';
import { validate } from '../middleware/validation';

// Type guard to ensure userUuid exists
interface AuthenticatedRequest extends Request {
  userUuid: string;
  userEmail?: string;
}

const router = Router();
router.use(authenticate);

const createTransactionSchema = z.object({
  circleWalletId: z.string(),
  blockchain: z.string(),
  tokenAddress: z.string().optional(),
  amount: z.string(),
  destinationAddress: z.string(),
  feeLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  refId: z.string().optional(),
});

router.post('/transfer', validate(createTransactionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.userUuid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userUuid = authReq.userUuid;
    const { circleWalletId, blockchain, tokenAddress, amount, destinationAddress, feeLevel, refId } = req.body;

    // Verify wallet belongs to user's wallet set
    const user = await getUserByUuid(userUuid);
    if (!user || !user.circle_wallet_set_id) {
      res.status(404).json({ error: 'User has no wallet set' });
      return;
    }

    // Verify the wallet belongs to the user's wallet set
    const walletsResponse = await circleClient.listWallets({
      walletSetId: user.circle_wallet_set_id,
    });

    const wallet = walletsResponse.data?.wallets?.find(w => w.id === circleWalletId);
    if (!wallet) {
      res.status(404).json({ error: 'Wallet not found or does not belong to user' });
      return;
    }

    const transactionInput: any = {
      walletId: circleWalletId,
      amount: [amount],
      destinationAddress,
      fee: {
        type: 'level',
        config: {
          feeLevel,
        },
      },
    };

    if (tokenAddress && tokenAddress.trim() !== '') {
      transactionInput.blockchain = blockchain;
      transactionInput.tokenAddress = tokenAddress;
    } else {
      transactionInput.blockchain = blockchain;
      transactionInput.tokenAddress = '';
    }

    if (refId) {
      transactionInput.refId = refId;
    }

    const response = await circleClient.createTransaction(transactionInput);

    if (!response.data) {
      res.status(500).json({ error: 'Failed to create transaction' });
      return;
    }

    res.status(201).json({
      message: 'Transaction created successfully',
      circleTransaction: {
        id: response.data.id,
        state: response.data.state,
      },
    });
  } catch (error: any) {
    console.error('Transaction creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create transaction',
      details: error.message 
    });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.userUuid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userUuid = authReq.userUuid;
    const user = await getUserByUuid(userUuid);

    if (!user || !user.circle_wallet_set_id) {
      res.json({ transactions: [] });
      return;
    }

    // Get all wallets in the user's wallet set
    const walletsResponse = await circleClient.listWallets({
      walletSetId: user.circle_wallet_set_id,
    });

    if (!walletsResponse.data?.wallets || walletsResponse.data.wallets.length === 0) {
      res.json({ transactions: [] });
      return;
    }

    // Note: Circle SDK doesn't have a direct "list transactions by wallet set" endpoint
    // Transactions would need to be queried per wallet or via webhooks
    // For now, return empty array as transactions are not stored in our DB
    res.json({
      transactions: [],
      message: 'Transaction history is managed by Circle. Query individual wallets for transaction details.',
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;

