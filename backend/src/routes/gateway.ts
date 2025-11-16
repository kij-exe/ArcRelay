import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getUserByUuid } from '../db/connection';
import {
  queryUserBalances,
  selectTokensForTransfer,
  depositToGateway,
  createBurnIntent,
  createBurnIntentTypedData,
  signBurnIntent,
  submitBurnIntentsToGateway,
  getWalletAddress,
  GATEWAY_DOMAIN_CONFIGS,
  getDomainConfigByBlockchain,
} from '../services/gatewayService';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

interface AuthenticatedRequest extends Request {
  userUuid: string;
  userEmail?: string;
}

const router = Router();
router.use(authenticate);

const gatewayTransferSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a valid number'),
  destinationAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format'),
  chain: z.enum(['Avalanche', 'HyperEVM', 'ARC']),
  network: z.enum(['Fuji', 'Testnet']),
  /**
   * Optional list of source wallets to use for funding the transfer.
   * Format: "Chain:Network", e.g. "Avalanche:Fuji", "ARC:Testnet"
   * If omitted, all user wallets are considered.
   */
  sourceWallets: z
    .array(z.enum(['Avalanche:Fuji', 'HyperEVM:Testnet', 'ARC:Testnet']))
    .optional(),
});

router.post('/transfer', validate(gatewayTransferSchema), async (req: AuthRequest, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.userUuid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userUuid = authReq.userUuid;
    const { amount, destinationAddress, chain, network, sourceWallets } = req.body as {
      amount: string;
      destinationAddress: string;
      chain: 'Avalanche' | 'HyperEVM' | 'ARC';
      network: 'Fuji' | 'Testnet';
      sourceWallets?: Array<'Avalanche:Fuji' | 'HyperEVM:Testnet' | 'ARC:Testnet'>;
    };

    // Get user and verify wallet set exists
    const user = await getUserByUuid(userUuid);
    if (!user || !user.circle_wallet_set_id) {
      res.status(404).json({ error: 'User has no wallet set' });
      return;
    }

    // Convert amount to bigint (assuming 6 decimals for USDC)
    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
    // Fee buffer: 0.1% of amount (example); this is the *fee* component
    const feeBuffer = (amountBigInt * 1n) / 1000n;
    const maxFee = feeBuffer;
    const totalRequired = amountBigInt + maxFee; // amount + fee

    // Resolve destination chain configuration from global map
    const configKey = `${chain}:${network}`;
    const destinationConfig = GATEWAY_DOMAIN_CONFIGS[configKey];
    if (!destinationConfig) {
      res.status(400).json({ error: `Unsupported chain/network combination: ${chain} ${network}` });
      return;
    }
    const destinationBlockchain = destinationConfig.blockchain;

    // Resolve optional source wallets into allowed Circle blockchain identifiers
    let allowedBlockchains: string[] | undefined;
    if (sourceWallets && sourceWallets.length > 0) {
      const configs = sourceWallets
        .map((key) => GATEWAY_DOMAIN_CONFIGS[key])
        .filter((c): c is (typeof GATEWAY_DOMAIN_CONFIGS)[string] => Boolean(c));

      if (configs.length === 0) {
        res.status(400).json({
          error: 'No valid sourceWallets provided',
        });
        return;
      }

      allowedBlockchains = Array.from(new Set(configs.map((c) => c.blockchain)));
    }

    // Step 1: Query user balances
    console.log(
      `[Gateway] Step 1: Querying balances for user ${userUuid} (sources=${allowedBlockchains?.join(
        ','
      ) || 'ALL'})`
    );
    const balances = await queryUserBalances(user.circle_wallet_set_id, allowedBlockchains);
    
    if (balances.length === 0) {
      res.status(400).json({ error: 'No USDC balances found in user wallets' });
      return;
    }

    // Step 2: Select tokens to use (must cover amount + fee)
    console.log(
      `[Gateway] Step 2: Selecting tokens for transfer of ${amount} USDC (totalRequired=${totalRequired.toString()})`
    );
    const selectedTokens = selectTokensForTransfer(balances, totalRequired);

    // Step 3: Deposit tokens to Gateway contracts
    console.log(`[Gateway] Step 3: Depositing ${selectedTokens.length} token(s) to Gateway`);
    const depositTxIds: string[] = [];
    for (const token of selectedTokens) {
      const txId = await depositToGateway(
        token.walletId,
        token.blockchain,
        token.tokenAddress,
        token.amount
      );
      depositTxIds.push(txId);
    }

    // Step 4: Create and sign burn intents
    console.log(`[Gateway] Step 4: Creating and signing burn intents`);
    const burnIntentRequests = [];
    
    for (const token of selectedTokens) {
      // Get wallet address for source depositor
      const walletAddress = await getWalletAddress(token.walletId);
      
      // Create burn intent
      // NOTE: burn "value" is the user-facing amount (amountBigInt), while
      // maxFee covers the additional fee component. We deposit amount+fee,
      // but only burn the user amount and allow Gateway to charge up to maxFee.
      const burnIntent = createBurnIntent(
        token.blockchain,
        destinationBlockchain,
        token.tokenAddress,
        destinationConfig.usdcAddress,
        walletAddress,
        destinationAddress,
        amountBigInt,
        maxFee
      );

      // Create typed data
      const typedData = createBurnIntentTypedData(burnIntent);

      // Sign using Circle API
      const signature = await signBurnIntent(token.walletId, typedData);

      burnIntentRequests.push({
        burnIntent: typedData.message,
        signature,
      });
    }

       // Step 5: Submit to Gateway API
       console.log(`[Gateway] Step 5: Submitting burn intents to Gateway API`);
       const attestations = await submitBurnIntentsToGateway(burnIntentRequests);

       // Step 5.5: Wait for burn intents to be finalized before minting
       // Note: the Gateway API only returns attestations once the underlying
       // burns/deposits have been validated. This hook is here so that if in
       // the future we need additional checks or polling, we can add them
       // without changing the external behaviour of this route.
       const finalizedAttestations = attestations;

       // Step 6: Mint on destination chain using relayer
       console.log(`[Gateway] Step 6: Minting on ${destinationBlockchain} using relayer`);
       const mintTxHashes = await mintOnDestinationChain(
         destinationBlockchain,
         finalizedAttestations
       );

    res.status(200).json({
      message: 'Gateway transfer initiated successfully',
      depositTransactions: depositTxIds,
      mintTransactions: mintTxHashes,
      destinationBlockchain,
      destinationAddress,
      amount: amount,
    });
  } catch (error: any) {
    console.error('Gateway transfer error:', error);
    res.status(500).json({
      error: 'Failed to process Gateway transfer',
      details: error.message,
    });
  }
});

/**
 * Mint tokens on destination chain using relayer
 */
async function mintOnDestinationChain(
  destinationBlockchain: string,
  attestations: Array<{ attestation: string; signature: string }>
): Promise<string[]> {
  // Get relayer account
  const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerPrivateKey) {
    throw new Error('RELAYER_PRIVATE_KEY not configured');
  }

  const relayerAccount = privateKeyToAccount(relayerPrivateKey as `0x${string}`);

  // Get chain configuration
  const chainConfig = getDomainConfigByBlockchain(destinationBlockchain);
  if (!chainConfig) {
    throw new Error(`Unsupported destination blockchain: ${destinationBlockchain}`);
  }

  const client = createWalletClient({
    account: relayerAccount,
    chain: chainConfig.viemChain,
    transport: http(),
  });

  // Gateway Minter ABI
  const gatewayMinterAbi = [
    {
      type: 'function',
      name: 'gatewayMint',
      inputs: [
        { name: 'attestationPayload', type: 'bytes', internalType: 'bytes' },
        { name: 'signature', type: 'bytes', internalType: 'bytes' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ];

  // Mint each attestation using the relayer account
  const txHashes: string[] = [];
  for (const { attestation, signature } of attestations) {
    const txHash = await client.writeContract({
      address: chainConfig.minterContractAddress as `0x${string}`,
      abi: gatewayMinterAbi,
      functionName: 'gatewayMint',
      chain: chainConfig.viemChain,
      account: relayerAccount,
      args: [
        attestation as `0x${string}`,
        signature as `0x${string}`,
      ],
    });
    txHashes.push(txHash);
  }

  return txHashes;
}

export default router;

