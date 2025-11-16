import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { circleClient } from '../services/circleClient';
import { getWalletTokenBalancesById } from '../services/gatewayService';
import { getUserByUuid } from '../db/connection';

// Type guard to ensure userUuid exists
interface AuthenticatedRequest extends Request {
  userUuid: string;
  userEmail?: string;
}

const router = Router();
router.use(authenticate);

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
      res.json({ balances: [] });
      return;
    }

    // Get all wallets in the user's wallet set
    const walletsResponse = await circleClient.listWallets({
      walletSetId: user.circle_wallet_set_id,
    });

    if (!walletsResponse.data?.wallets || walletsResponse.data.wallets.length === 0) {
      res.json({ balances: [] });
      return;
    }

    // Get balances for each wallet
    const balances = await Promise.all(
      walletsResponse.data.wallets.map(async (wallet) => {
        try {
          const tokenBalances = await getWalletTokenBalancesById(wallet.id);

          return {
            circleWalletId: wallet.id,
            blockchain: wallet.blockchain,
            address: wallet.address,
            state: wallet.state,
            balances: tokenBalances,
          };
        } catch (error: any) {
          console.error(`Error fetching balance for wallet ${wallet.id}:`, error);
          return {
            circleWalletId: wallet.id,
            blockchain: wallet.blockchain,
            address: wallet.address,
            state: wallet.state,
            balances: [],
            error: error.message,
          };
        }
      })
    );

    res.json({
      balances,
    });
  } catch (error: any) {
    console.error('Get balances error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch balances',
      details: error.message 
    });
  }
});

router.get('/:walletId', async (req: AuthRequest, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.userUuid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userUuid = authReq.userUuid;
    const circleWalletId = req.params.walletId;

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
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }

    const tokenBalances = await getWalletTokenBalancesById(circleWalletId);

    res.json({
      circleWalletId: wallet.id,
      blockchain: wallet.blockchain,
      address: wallet.address,
      state: wallet.state,
      balances: tokenBalances,
    });
  } catch (error: any) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch wallet balance',
      details: error.message 
    });
  }
});

export default router;

