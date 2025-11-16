import { circleClient } from './circleClient';
import { randomBytes } from 'node:crypto';
import { pad, maxUint256, zeroAddress, defineChain } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';

// ---------------------------------------------------------------------------
// Gateway domain / chain configuration (limited to 3 chains)
// ---------------------------------------------------------------------------

// Shared Gateway contract addresses (same across supported networks)
const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const GATEWAY_MINTER_ADDRESS = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';

// USDC addresses (env override with hardcoded defaults)
const ETH_SEPOLIA_USDC_ADDRESS =
  process.env.ETH_SEPOLIA_USDC_ADDRESS ??
  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

const BASE_SEPOLIA_USDC_ADDRESS =
  process.env.BASE_SEPOLIA_USDC_ADDRESS ??
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const ARC_TESTNET_USDC_ADDRESS =
  process.env.ARC_TESTNET_USDC_ADDRESS ??
  '0x3600000000000000000000000000000000000000';

// ARC Testnet chain definition (not in viem default chains)
const arcTestnetChain = defineChain({
  id: 5042002, // ARC-TESTNET chain ID
  name: 'ARC Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ARC Testnet Explorer',
      url: 'https://testnet.arcscan.app/',
    },
  },
  testnet: true,
});

export interface GatewayDomainConfig {
  chain: 'Ethereum' | 'Base' | 'ARC';
  network: 'Sepolia' | 'Testnet';
  /** Circle blockchain identifier, e.g. ETH-SEPOLIA */
  blockchain: 'ETH-SEPOLIA' | 'BASE-SEPOLIA' | 'ARC-TESTNET';
  /** Gateway domain id from Circle spec */
  domain: number;
  walletContractAddress: string;
  minterContractAddress: string;
  usdcAddress: string;
  /** viem chain object for relayer usage */
  viemChain: any;
}

// Keyed by `${chain}:${network}` from user input
export const GATEWAY_DOMAIN_CONFIGS: Record<string, GatewayDomainConfig> = {
  'Ethereum:Sepolia': {
    chain: 'Ethereum',
    network: 'Sepolia',
    blockchain: 'ETH-SEPOLIA',
    domain: 0,
    walletContractAddress: GATEWAY_WALLET_ADDRESS,
    minterContractAddress: GATEWAY_MINTER_ADDRESS,
    usdcAddress: ETH_SEPOLIA_USDC_ADDRESS,
    viemChain: sepolia,
  },
  'Base:Sepolia': {
    chain: 'Base',
    network: 'Sepolia',
    blockchain: 'BASE-SEPOLIA',
    domain: 6,
    walletContractAddress: GATEWAY_WALLET_ADDRESS,
    minterContractAddress: GATEWAY_MINTER_ADDRESS,
    usdcAddress: BASE_SEPOLIA_USDC_ADDRESS,
    viemChain: baseSepolia,
  },
  'ARC:Testnet': {
    chain: 'ARC',
    network: 'Testnet',
    blockchain: 'ARC-TESTNET',
    domain: 26,
    walletContractAddress: GATEWAY_WALLET_ADDRESS,
    minterContractAddress: GATEWAY_MINTER_ADDRESS,
    usdcAddress: ARC_TESTNET_USDC_ADDRESS,
    viemChain: arcTestnetChain,
  },
};

// Helper: look up config by Circle blockchain identifier (e.g. ETH-SEPOLIA)
export function getDomainConfigByBlockchain(
  blockchain: string
): GatewayDomainConfig | undefined {
  return Object.values(GATEWAY_DOMAIN_CONFIGS).find(
    (c) => c.blockchain === blockchain
  );
}

export interface TokenBalance {
  walletId: string;
  blockchain: string;
  address: string;
  tokenAddress: string;
  amount: bigint;
  decimals: number;
}

interface SelectedToken {
  walletId: string;
  blockchain: string;
  address: string;
  tokenAddress: string;
  amount: bigint;
  decimals: number;
}

interface BurnIntent {
  maxBlockHeight: bigint;
  maxFee: bigint;
  spec: {
    version: number;
    sourceDomain: number;
    destinationDomain: number;
    sourceContract: string;
    destinationContract: string;
    sourceToken: string;
    destinationToken: string;
    sourceDepositor: string;
    destinationRecipient: string;
    sourceSigner: string;
    destinationCaller: string;
    value: bigint;
    salt: string;
    hookData: string;
  };
}

/**
 * Parse a decimal string amount into an integer with 6 decimal places (USDC-style).
 * Examples:
 *  "10"   -> 10_000000n
 *  "0.1"  -> 100000n
 *  "0.01" -> 10000n
 */
function parseUsdcAmountToBaseUnits(amount: string): bigint {
  const trimmed = amount.trim();
  if (!trimmed) return 0n;

  const [intPartRaw, fracPartRaw = ''] = trimmed.split('.');
  const intPart = intPartRaw.replace(/[^0-9]/g, '') || '0';
  const fracPartPadded = (fracPartRaw.replace(/[^0-9]/g, '') + '000000').slice(
    0,
    6
  );

  const full = `${intPart}${fracPartPadded}`;
  return BigInt(full);
}

/**
 * Query all user wallets and their USDC balances
 */
export async function getWalletsForWalletSet(
  walletSetId: string
): Promise<any[]> {
  const allWallets: any[] = [];

  // Use getWalletsWithBalances per supported blockchain so balances are kept up to date
  for (const config of Object.values(GATEWAY_DOMAIN_CONFIGS)) {
    const walletsWithBalances = await circleClient.getWalletsWithBalances({
      blockchain: config.blockchain,
      walletSetId,
    });
    if (walletsWithBalances.data?.wallets) {
      allWallets.push(...walletsWithBalances.data.wallets);
    }
  }

  return allWallets;
}

export async function queryUserBalances(
  walletSetId: string
): Promise<TokenBalance[]> {
  const wallets = await getWalletsForWalletSet(walletSetId);

  if (!wallets.length) {
    return [];
  }

  const balances: TokenBalance[] = [];

  for (const wallet of wallets) {
    try {
      const tb = await getWalletUsdcBalance(wallet);
      if (tb) {
        balances.push(tb);
      }
    } catch (error) {
      console.error(`Error fetching balance for wallet ${wallet.id}:`, error);
    }
  }

  return balances;
}

/**
 * Select tokens from balances that satisfy the requested amount
 */
/**
 * Compute aggregated USDC-like balance for a single wallet.
 * Returns a TokenBalance in base units (6 decimals) or null if no USDC tokens.
 */
export async function getWalletTokenBalancesById(
  walletId: string
): Promise<any[]> {
  const balanceResponse = await circleClient.getWalletTokenBalance({
    id: walletId,
    includeAll: true,
  });
  return (balanceResponse.data?.tokenBalances as any[]) || [];
}

export async function getWalletUsdcBalance(
  wallet: any
): Promise<TokenBalance | null> {
  const domainConfig = getDomainConfigByBlockchain(wallet.blockchain);
  if (!domainConfig) return null;

  // Use the same approach as /balances: fetch balances via getWalletTokenBalance
  const tokenBalances: any[] = await getWalletTokenBalancesById(wallet.id);
  if (!tokenBalances.length) return null;

  // Look for all tokens whose name contains "USDC"
  const usdcTokens = tokenBalances.filter((tb: any) => {
    const token = tb.token;
    if (!token) return false;
    const name = String(token.name || '');
    return name.toUpperCase().includes('USDC');
  });

  if (!usdcTokens.length) {
    return null;
  }

  // Aggregate all USDC-like balances on this wallet
  let totalBaseUnits = 0n;
  for (const tb of usdcTokens) {
    const rawAmount = String(tb.amount ?? '0');
    totalBaseUnits += parseUsdcAmountToBaseUnits(rawAmount);
  }

  return {
    walletId: wallet.id,
    blockchain: wallet.blockchain,
    address: wallet.address,
    tokenAddress: domainConfig.usdcAddress,
    amount: totalBaseUnits,
    // Internally treat USDC as 6-decimal token everywhere
    decimals: 6,
  };
}

export function selectTokensForTransfer(
  balances: TokenBalance[],
  requestedAmount: bigint
): SelectedToken[] {
  const selected: SelectedToken[] = [];
  let remaining = requestedAmount;

  // Sort by amount descending to use larger balances first
  const sortedBalances = [...balances].sort((a, b) => {
    if (a.amount > b.amount) return -1;
    if (a.amount < b.amount) return 1;
    return 0;
  });

  for (const balance of sortedBalances) {
    if (remaining <= 0n) break;

    if (balance.amount > 0n) {
      const amountToUse = balance.amount > remaining ? remaining : balance.amount;
      selected.push({
        ...balance,
        amount: amountToUse,
      });
      remaining -= amountToUse;
    }
  }

  if (remaining > 0n) {
    throw new Error(`Insufficient balance. Need ${requestedAmount.toString()}, have ${(requestedAmount - remaining).toString()}`);
  }

  return selected;
}

/**
 * Simple sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until a Circle transaction reaches a terminal confirmed state
 */
async function waitForTransactionConfirmed(
  transactionId: string,
  options?: { maxAttempts?: number; pollIntervalMs?: number }
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 40; // ~16 seconds at 40*400ms
  const pollIntervalMs = options?.pollIntervalMs ?? 400;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await circleClient.getTransaction({ id: transactionId });
    const tx = resp.data?.transaction as any;

    if (tx?.state) {
      const state = tx.state as string;
      console.log(`[waitForTransactionConfirmed] Attempt ${attempt + 1}: state=${tx.state}`);
      if (state === 'CONFIRMED' || state === 'COMPLETE' || state === 'CLEARED') {
        return;
      }
      if (state === 'FAILED' || state === 'DENIED' || state === 'CANCELLED') {
        throw new Error(
          `Transaction ${transactionId} failed with state=${state}${
            tx.errorReason ? ` reason=${tx.errorReason}` : ''
          }`
        );
      }
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Transaction ${transactionId} not confirmed within timeout window`
  );
}

/**
 * Deposit tokens to Gateway contract using Circle API
 * This requires two steps:
 * 1. Approve USDC spending to Gateway contract
 * 2. Call Gateway deposit() function using contract execution
 */
export async function depositToGateway(
  walletId: string,
  blockchain: string,
  tokenAddress: string,
  amount: bigint
): Promise<string> {
  const domainConfig = getDomainConfigByBlockchain(blockchain);
  if (!domainConfig) {
    throw new Error(`Unsupported blockchain for deposit: ${blockchain}`);
  }

  // Log concise info about the deposit operation (for debugging INSUFFICIENT_TOKEN)
  const humanAmount = (() => {
    const factor = 10n ** 6n; // USDC 6 decimals
    const integer = amount / factor;
    const frac = amount % factor;
    const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
    return fracStr ? `${integer.toString()}.${fracStr}` : integer.toString();
  })();
  console.log(
    `[Gateway][depositToGateway] walletId=${walletId} blockchain=${blockchain} token=${tokenAddress} amountBase=${amount.toString()} amount=${humanAmount} (USDC)`
  );

  // Step 1: Approve USDC spending to Gateway contract
  // Call ERC20 approve(token, amount) function
  const approveTx = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: tokenAddress,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [GATEWAY_WALLET_ADDRESS, amount.toString()],
    fee: {
      type: 'level',
      config: {
        feeLevel: 'MEDIUM',
      },
    },
  });
  if (!approveTx.data?.id) {
    throw new Error('Failed to create approval transaction');
  }

  // Wait for approval transaction to be confirmed on-chain
  await waitForTransactionConfirmed(approveTx.data.id);

  // Step 2: Call Gateway deposit() function using contract execution
  const depositTx = await circleClient.createContractExecutionTransaction({
    walletId,
    contractAddress: domainConfig.walletContractAddress,
    abiFunctionSignature: 'deposit(address,uint256)',
    abiParameters: [tokenAddress, amount.toString()],
    fee: {
      type: 'level',
      config: {
        feeLevel: 'MEDIUM',
      },
    },
  });

  if (!depositTx.data?.id) {
    throw new Error('Failed to create deposit transaction');
  }

  // Wait for deposit transaction to be confirmed on-chain
  await waitForTransactionConfirmed(depositTx.data.id);

  return depositTx.data.id;
}

/**
 * Create burn intent for Gateway transfer
 */
export function createBurnIntent(
  sourceBlockchain: string,
  destinationBlockchain: string,
  sourceTokenAddress: string,
  destinationTokenAddress: string,
  sourceDepositor: string,
  destinationRecipient: string,
  value: bigint,
  maxFee: bigint
): BurnIntent {
  const sourceConfig = getDomainConfigByBlockchain(sourceBlockchain);
  const destinationConfig = getDomainConfigByBlockchain(destinationBlockchain);

  if (!sourceConfig || !destinationConfig) {
    throw new Error(
      `Unsupported blockchain: ${sourceBlockchain} or ${destinationBlockchain}`
    );
  }

  return {
    maxBlockHeight: maxUint256,
    maxFee,
    spec: {
      version: 1,
      sourceDomain: sourceConfig.domain,
      destinationDomain: destinationConfig.domain,
      sourceContract: sourceConfig.walletContractAddress,
      destinationContract: destinationConfig.minterContractAddress,
      sourceToken: sourceTokenAddress,
      destinationToken: destinationTokenAddress,
      sourceDepositor,
      destinationRecipient,
      sourceSigner: sourceDepositor,
      destinationCaller: zeroAddress,
      value,
      salt: '0x' + randomBytes(32).toString('hex'),
      hookData: '0x',
    },
  };
}

/**
 * Convert address to bytes32 format
 */
function addressToBytes32(address: string): string {
  return pad(address.toLowerCase() as `0x${string}`, { size: 32 });
}

/**
 * Create EIP-712 typed data for burn intent
 */
export function createBurnIntentTypedData(burnIntent: BurnIntent) {
  const domain = { name: 'GatewayWallet', version: '1' };

  const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
  ];

  const TransferSpec = [
    { name: 'version', type: 'uint32' },
    { name: 'sourceDomain', type: 'uint32' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'sourceContract', type: 'bytes32' },
    { name: 'destinationContract', type: 'bytes32' },
    { name: 'sourceToken', type: 'bytes32' },
    { name: 'destinationToken', type: 'bytes32' },
    { name: 'sourceDepositor', type: 'bytes32' },
    { name: 'destinationRecipient', type: 'bytes32' },
    { name: 'sourceSigner', type: 'bytes32' },
    { name: 'destinationCaller', type: 'bytes32' },
    { name: 'value', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'hookData', type: 'bytes' },
  ];

  const BurnIntent = [
    { name: 'maxBlockHeight', type: 'uint256' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'spec', type: 'TransferSpec' },
  ];

  return {
    types: { EIP712Domain, TransferSpec, BurnIntent },
    domain,
    primaryType: 'BurnIntent',
    message: {
      ...burnIntent,
      spec: {
        ...burnIntent.spec,
        sourceContract: addressToBytes32(burnIntent.spec.sourceContract),
        destinationContract: addressToBytes32(burnIntent.spec.destinationContract),
        sourceToken: addressToBytes32(burnIntent.spec.sourceToken),
        destinationToken: addressToBytes32(burnIntent.spec.destinationToken),
        sourceDepositor: addressToBytes32(burnIntent.spec.sourceDepositor),
        destinationRecipient: addressToBytes32(burnIntent.spec.destinationRecipient),
        sourceSigner: addressToBytes32(burnIntent.spec.sourceSigner),
        destinationCaller: addressToBytes32(burnIntent.spec.destinationCaller),
      },
    },
  };
}

/**
 * Sign burn intent using Circle API
 */
export async function signBurnIntent(
  walletId: string,
  typedData: ReturnType<typeof createBurnIntentTypedData>
): Promise<string> {
  // JSON.stringify cannot handle BigInt; convert all BigInts to strings first
  const serializedTypedData = JSON.stringify(
    typedData,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
  );

  const response = await circleClient.signTypedData({
    walletId,
    data: serializedTypedData,
    memo: 'Gateway transfer burn intent',
  });

  if (!response.data?.signature) {
    throw new Error('Failed to sign burn intent');
  }

  return response.data.signature;
}

/**
 * Submit signed burn intents to Gateway API
 */
export async function submitBurnIntentsToGateway(
  requests: Array<{ burnIntent: BurnIntent; signature: string }>
): Promise<Array<{ attestation: string; signature: string }>> {
  const response = await fetch(
    'https://gateway-api-testnet.circle.com/v1/transfer',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requests, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ),
    }
  );

  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(`Gateway API error: ${response.status} - ${JSON.stringify(errorBody)}`);
  }

  const json: any = await response.json();

  // Gateway API may return either a single object or an array; normalize to array
  const items: any[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.transfers)
    ? json.transfers
    : json
    ? [json]
    : [];

  return items.map((item: any) => ({
    attestation: item.attestation,
    signature: item.signature,
  }));
}

/**
 * Get wallet address from wallet ID
 */
export async function getWalletAddress(walletId: string): Promise<string> {
  const wallet = await circleClient.getWallet({ id: walletId });
  if (!wallet.data?.wallet?.address) {
    throw new Error(`Wallet ${walletId} not found`);
  }
  return wallet.data.wallet.address;
}

