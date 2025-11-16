// Script to deposit USDC directly to a user's Circle wallet
// Run with: npx tsx scripts/deposit-to-user.ts

import { Address, privateKeyToAccount } from 'viem/accounts';
import { parseUnits } from 'viem';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { baseSepolia, sepolia, avalancheFuji } from 'viem/chains';
import type { Chain } from 'viem';

// Configuration
const FACILITATOR_BASE = 'http://localhost:3002';
const USER_WALLET_ADDRESS = '0x77d148dca01ba0665b89afb7834cfd2472b85141' as Address; // User's Circle wallet
const DESIRED_NETWORK = 'arc-testnet';
const AMOUNT_USDC = '1.0'; // Amount to deposit in USDC

// Private key of the PAYER (must hold test USDC on the chosen network)
const PAYER_PRIVATE_KEY = process.env.PAYER_PK as `0x${string}`;

// Arc Testnet chain definition
const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [process.env.ARC_TESTNET_RPC_URL || 'https://rpc-testnet.archon.foundation'] } },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer-sepolia.archon.foundation' },
  },
});

// Network configuration
const NETWORK_CONFIG: Record<string, { chain: Chain; usdcAddress: Address; usdcName: string; usdcVersion: string; rpcUrl: string }> = {
  'base-sepolia': {
    chain: baseSepolia,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    usdcName: 'USDC',
    usdcVersion: '2',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || '',
  },
  'ethereum-sepolia': {
    chain: sepolia,
    usdcAddress: process.env.ETHEREUM_SEPOLIA_USDC_ADDRESS as Address || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    usdcName: 'USDC',
    usdcVersion: '2',
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL || '',
  },
  'arc-testnet': {
    chain: arcTestnet,
    usdcAddress: process.env.ARC_TESTNET_USDC_ADDRESS as Address || '0x3600000000000000000000000000000000000000',
    usdcName: 'USDC',
    usdcVersion: '2',
    rpcUrl: process.env.ARC_TESTNET_RPC_URL || 'https://rpc-testnet.archon.foundation',
  },
  'avalanche-fuji': {
    chain: avalancheFuji,
    usdcAddress: (process.env.AVALANCHE_FUJI_USDC_ADDRESS as Address) || '' as Address,
    usdcName: process.env.AVALANCHE_FUJI_USDC_NAME || 'USDC',
    usdcVersion: process.env.AVALANCHE_FUJI_USDC_VERSION || '2',
    rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || '',
  },
};

// EIP-3009 Transfer Authorization type definition
const TRANSFER_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

interface PaymentRequirements {
  scheme: string;
  network: string;
  token: Address;
  amount: string;
  recipient: Address;
  description: string;
  maxTimeoutSeconds: number;
}

interface EIP3009PaymentPayload {
  x402Version: string;
  scheme: string;
  network: string;
  signature: `0x${string}`;
  payload: {
    from: Address;
    to: Address;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: `0x${string}`;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  };
}

async function main() {
  if (!PAYER_PRIVATE_KEY) {
    throw new Error('Set PAYER_PK in env (0x...)');
  }

  const networkConfig = NETWORK_CONFIG[DESIRED_NETWORK];
  if (!networkConfig) {
    throw new Error(`Unknown network: ${DESIRED_NETWORK}`);
  }

  const account = privateKeyToAccount(PAYER_PRIVATE_KEY);
  const payerAddress = account.address;

  console.log('========================================');
  console.log('DEPOSIT TO USER WALLET');
  console.log('========================================');
  console.log('Payer address:', payerAddress);
  console.log('User wallet:', USER_WALLET_ADDRESS);
  console.log('Amount:', AMOUNT_USDC, 'USDC');
  console.log('Network:', DESIRED_NETWORK);
  console.log('Chain ID:', networkConfig.chain.id);
  console.log('USDC Address:', networkConfig.usdcAddress);
  console.log('');

  // Step 1: Get deposit requirements from facilitator
  console.log('Step 1: Getting deposit requirements...');
  const requirementsResponse = await fetch(`${FACILITATOR_BASE}/deposit/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network: DESIRED_NETWORK,
      amount: parseUnits(AMOUNT_USDC, 6).toString(), // Convert to 6 decimals
      userWalletAddress: USER_WALLET_ADDRESS,
    }),
  });

  if (!requirementsResponse.ok) {
    throw new Error(`Failed to get requirements: ${await requirementsResponse.text()}`);
  }

  const { paymentRequirements } = await requirementsResponse.json() as { paymentRequirements: PaymentRequirements };

  console.log('Payment requirements received:');
  console.log('  Token:', paymentRequirements.token);
  console.log('  Amount:', paymentRequirements.amount, '(in smallest units)');
  console.log('  Recipient:', paymentRequirements.recipient);
  console.log('  Description:', paymentRequirements.description);
  console.log('');

  // Verify recipient is the user's wallet
  if (paymentRequirements.recipient.toLowerCase() !== USER_WALLET_ADDRESS.toLowerCase()) {
    throw new Error(`Recipient mismatch! Expected ${USER_WALLET_ADDRESS}, got ${paymentRequirements.recipient}`);
  }
  console.log('✅ Confirmed: Recipient is user\'s wallet');
  console.log('');

  // Step 2: Create EIP-3009 authorization
  console.log('Step 2: Creating EIP-3009 authorization...');

  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60; // Valid from 1 minute ago
  const validBefore = now + paymentRequirements.maxTimeoutSeconds;

  // Generate random nonce
  const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}` as `0x${string}`;

  const authorization = {
    from: payerAddress,
    to: paymentRequirements.recipient,
    value: BigInt(paymentRequirements.amount),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  };

  console.log('Authorization details:');
  console.log('  From:', authorization.from);
  console.log('  To:', authorization.to);
  console.log('  Value:', authorization.value.toString());
  console.log('  Valid after:', new Date(validAfter * 1000).toISOString());
  console.log('  Valid before:', new Date(validBefore * 1000).toISOString());
  console.log('');

  // Step 3: Sign the authorization
  console.log('Step 3: Signing authorization...');

  const walletClient = createWalletClient({
    account,
    chain: networkConfig.chain,
    transport: http(networkConfig.rpcUrl),
  });

  const domain = {
    name: 'USDC',
    version: '2',
    chainId: networkConfig.chain.id,
    verifyingContract: networkConfig.usdcAddress,
  };

  const signature = await walletClient.signTypedData({
    domain,
    types: TRANSFER_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });

  console.log('Signature:', signature.slice(0, 20) + '...' + signature.slice(-20));
  console.log('');

  // Split signature into v, r, s
  const r = signature.slice(0, 66) as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(signature.slice(130, 132), 16);

  console.log('Signature components:');
  console.log('  r:', r.slice(0, 10) + '...');
  console.log('  s:', s.slice(0, 10) + '...');
  console.log('  v:', v);
  console.log('');

  // Step 4: Submit to deposit/settle
  console.log('Step 4: Submitting deposit to facilitator...');

  const paymentPayload: EIP3009PaymentPayload = {
    x402Version: '0.0.1',
    scheme: 'exact',
    network: DESIRED_NETWORK,
    signature,
    payload: {
      from: payerAddress,
      to: paymentRequirements.recipient,
      value: paymentRequirements.amount,
      validAfter: Number(authorization.validAfter),
      validBefore: Number(authorization.validBefore),
      nonce,
      v,
      r,
      s,
    },
  };

  const settleResponse = await fetch(`${FACILITATOR_BASE}/deposit/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentRequirements,
      paymentPayload,
    }),
  });

  if (!settleResponse.ok) {
    const error = await settleResponse.text();
    throw new Error(`Settlement failed: ${error}`);
  }

  const result = await settleResponse.json();

  console.log('');
  console.log('========================================');
  console.log('✅ DEPOSIT SUCCESSFUL!');
  console.log('========================================');
  console.log('Transaction ID:', result.transactionId);
  console.log('State:', result.state);
  console.log('Amount:', result.amount, 'smallest units');
  console.log('From:', result.from);
  console.log('To:', result.to);
  console.log('');
  console.log('The USDC has been sent directly to the user\'s Circle wallet.');
  console.log('Check the withdraw page to see the updated balance!');
}

main().catch(error => {
  console.error('');
  console.error('❌ Error:', error);
  process.exit(1);
});