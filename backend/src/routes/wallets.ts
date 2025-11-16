import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { circleClient } from '../services/circleClient';
import { getUserByUuid, updateUserWalletSetId } from '../db/connection';

// Type guard to ensure userUuid exists
interface AuthenticatedRequest extends Request {
  userUuid: string;
  userEmail?: string;
}

const router = Router();
router.use(authenticate);

// Supported blockchains - automatically create wallets for all
const SUPPORTED_BLOCKCHAINS = ['BASE-SEPOLIA', 'ARB-SEPOLIA', 'ARC-TESTNET'] as const;

router.post('/create', async (req: AuthRequest, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.userUuid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userUuid = authReq.userUuid;

    // Check if user already has a wallet set
    const user = await getUserByUuid(userUuid);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.circle_wallet_set_id) {
      res.status(409).json({ error: 'User already has wallets created' });
      return;
    }

    // Step 1: Create a wallet set for this user
    const walletSetResponse = await circleClient.createWalletSet({
      name: `Wallet Set for ${user.email}`,
    });

    if (!walletSetResponse.data?.walletSet) {
      res.status(500).json({ error: 'Failed to create wallet set' });
      return;
    }

    const walletSetId = walletSetResponse.data.walletSet.id;

    // Step 2: Create 3 wallets (one for each supported blockchain) in the wallet set
    const walletsResponse = await circleClient.createWallets({
      blockchains: [...SUPPORTED_BLOCKCHAINS] as any,
      count: 1,
      walletSetId,
    });

    if (!walletsResponse.data?.wallets || walletsResponse.data.wallets.length === 0) {
      res.status(500).json({ error: 'Failed to create wallets' });
      return;
    }

    // Store the wallet set ID in the user record
    await updateUserWalletSetId(userUuid, walletSetId);

    res.status(201).json({
      message: 'Wallets created successfully',
      walletSet: {
        id: walletSetId,
        createDate: walletSetResponse.data.walletSet.createDate,
        updateDate: walletSetResponse.data.walletSet.updateDate,
      },
      wallets: walletsResponse.data.wallets.map(wallet => ({
        circleWalletId: wallet.id,
        blockchain: wallet.blockchain,
        address: wallet.address,
        state: wallet.state,
      })),
    });
  } catch (error: any) {
    console.error('Wallet creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create wallets',
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
      res.json({ walletSet: null, wallets: [] });
      return;
    }

    // Get wallet set information
    const walletSetResponse = await circleClient.getWalletSet({
      id: user.circle_wallet_set_id,
    });

    // Get all wallets in the wallet set
    const walletsResponse = await circleClient.listWallets({
      walletSetId: user.circle_wallet_set_id,
    });

    res.json({
      walletSet: walletSetResponse.data?.walletSet || null,
      walletSetId: user.circle_wallet_set_id,
      wallets: walletsResponse.data?.wallets?.map(wallet => ({
        circleWalletId: wallet.id,
        blockchain: wallet.blockchain,
        address: wallet.address,
        state: wallet.state,
        createDate: wallet.createDate,
        updateDate: wallet.updateDate,
      })) || [],
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet set' });
  }
});

export default router;

