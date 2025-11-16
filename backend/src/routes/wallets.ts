import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { circleClient } from '../services/circleClient';
import {
  getWalletsForWalletSet,
  getWalletUsdcBalance,
} from '../services/gatewayService';
import { getUserByUuid, updateUserWalletSetId } from '../db/connection';

// Type guard to ensure userUuid exists
interface AuthenticatedRequest extends Request {
  userUuid: string;
  userEmail?: string;
}

const router = Router();
router.use(authenticate);

// Supported blockchains for *developer-controlled wallets*.
// Note: as of now Circle's Developer-Controlled Wallets API does not
// support creating wallets on HyperEVM Testnet, so we only create
// wallets on chains that are actually supported by that API.
// HyperEVM is still supported on the Gateway side as a destination.
const SUPPORTED_BLOCKCHAINS = ['AVAX-FUJI', 'ARC-TESTNET'] as const;

/**
 * Build a single wallet info object including USDC balance (if available)
 */
async function buildWalletInfoWithUsdcBalance(wallet: any) {
  try {
    let usdcBalance: string | null = null;

    const tokenBalance = await getWalletUsdcBalance(wallet);
    if (tokenBalance) {
      const { amount, decimals } = tokenBalance;
      const factor = 10n ** BigInt(decimals);
      const integer = amount / factor;
      const frac = amount % factor;
      const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
      usdcBalance = fracStr ? `${integer.toString()}.${fracStr}` : integer.toString();
    }

    return {
      circleWalletId: wallet.id,
      blockchain: wallet.blockchain,
      address: wallet.address,
      state: wallet.state,
      createDate: wallet.createDate,
      updateDate: wallet.updateDate,
      usdcBalance,
    };
  } catch (err) {
    console.error(`Error fetching USDC balance for wallet ${wallet.id}:`, err);
    return {
      circleWalletId: wallet.id,
      blockchain: wallet.blockchain,
      address: wallet.address,
      state: wallet.state,
      createDate: wallet.createDate,
      updateDate: wallet.updateDate,
      usdcBalance: null as string | null,
    };
  }
}

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

    // Get all wallets in the wallet set (with balances) via shared helper
    const wallets = await getWalletsForWalletSet(user.circle_wallet_set_id);

    const walletsWithBalance = await Promise.all(
      wallets.map((wallet) => buildWalletInfoWithUsdcBalance(wallet)),
    );

    res.json({
      walletSet: walletSetResponse.data?.walletSet || null,
      walletSetId: user.circle_wallet_set_id,
      wallets: walletsWithBalance,
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet set' });
  }
});

export default router;

