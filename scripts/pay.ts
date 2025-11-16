// save as scripts/pay.ts and run with: npx tsx scripts/pay.ts
import { Address, privateKeyToAccount } from 'viem/accounts';
import { parseUnits } from 'viem';
import { base64Payload } from '../src/sdk/payload';
import {
  generateEIP712Payload as genPayload,
  payPerRequest as doPaidFetch,
} from '../src/sdk/client';
import { signEIP712PayloadPrivateKey } from '../src/sdk/signing';

const PROXY_BASE = 'http://localhost:4000';
const ENDPOINT_PATH = '/hello';
const ENDPOINT_URL = `${PROXY_BASE}${ENDPOINT_PATH}`;

// Choose the network you want to pay on
const DESIRED_NETWORK = 'base-sepolia' as const; // Changed from 'arc-testnet' to test with funded network

// Private key of the PAYER (must hold test USDC on the chosen network)
const PAYER_PRIVATE_KEY = process.env.PAYER_PK as `0x${string}`;

// Helper to fetch the 402 offer
async function getPaymentRequirement() {
  const res = await fetch(ENDPOINT_URL, { method: 'GET' });
  if (res.status !== 402) {
    throw new Error(`Expected 402, got ${res.status}`);
  }
  return (await res.json()) as {
    accepts: Array<{
      scheme: 'exact';
      network: string;
      maxAmountRequired: string;
      resource: string;
      description: string;
      mimeType: string;
      outputSchema?: object | null;
      payTo: Address;
      maxTimeoutSeconds: number;
      asset: Address;
      eip712Domain?: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Address;
      };
      nonce: `0x${string}`;
    }>;
  };
}

async function main() {
  if (!PAYER_PRIVATE_KEY) {
    throw new Error('Set PAYER_PK in env (0x...)');
  }
  const payer = privateKeyToAccount(PAYER_PRIVATE_KEY).address as Address;

  // 1) Get 402 offer and pick the desired network
  const req = await getPaymentRequirement();
  const offer = req.accepts.find((o) => o.network === DESIRED_NETWORK);
  if (!offer) throw new Error(`No offer for network: ${DESIRED_NETWORK}`);

  // Debug: log selected offer
  console.log('[pay] Selected offer:', {
    network: offer.network,
    humanAmount: offer.maxAmountRequired, // This is the actual amount from server
    asset: offer.asset,
    payTo: offer.payTo,
    nonce: offer.nonce,
    domain: offer.eip712Domain,
    timeoutSeconds: offer.maxTimeoutSeconds,
    resource: offer.resource,
  });

  // 2) Build a docsEntry shim so the SDK can compute the payload without fetching docs.json
  // Convert human amount (e.g., "10.0" USDC) to smallest units (USDC has 6 decimals)
  const atomicAmount = parseUnits(offer.maxAmountRequired, 6).toString();
  console.log('[pay] Atomic amount (USDC 6dp):', atomicAmount);

  const docsEntry = {
    id: `${offer.resource}`,              // e.g., "GET /hello"
    method: 'GET' as const,
    path: ENDPOINT_PATH,
    url: ENDPOINT_URL,
    description: offer.description,
    price: atomicAmount,
    payTo: offer.payTo,
    asset: offer.asset,
    network: offer.network as any,        // matches SupportedNetwork
    scheme: offer.scheme,                 // 'exact'
    maxTimeoutSeconds: offer.maxTimeoutSeconds,
  };

  // 3) Generate EIP-712 payload (uses server-provided domain + nonce)
  const payload = await genPayload(ENDPOINT_URL, { baseUrl: '' } as any, {
    fetch: fetch,
    payerAddress: payer,
    docsEntry,
    domainOverride: offer.eip712Domain,
    networkOverride: DESIRED_NETWORK,
    schemeOverride: 'exact',
    // Optional: provide the server nonce directly (already read from offer)
    nonceOverride: offer.nonce,
    defaultValiditySeconds: offer.maxTimeoutSeconds,
  });

  // Debug: log payload details & timing
  const now = Math.floor(Date.now() / 1000);
  console.log('[pay] Prepared payload:', {
    domain: payload.domain,
    network: payload.network,
    scheme: payload.scheme,
    message: payload.message,
    now,
    notBeforeSkew: now - Number(payload.message.validAfter),
    expiresIn: Number(payload.message.validBefore) - now,
  });

  // 4) Sign with the payer’s private key
  const signature = await signEIP712PayloadPrivateKey(PAYER_PRIVATE_KEY, payload);
  console.log('[pay] Signature:', `${signature.slice(0, 12)}...${signature.slice(-8)}`);

  // 5) Encode header and do the paid request
  const { hash, structured } = base64Payload(payload, signature);
  console.log('[pay] Header structured (truncated):', {
    x402Version: structured.x402Version,
    scheme: structured.scheme,
    network: structured.network,
    to: structured.payload.to,
    value: structured.payload.value,
    validAfter: structured.payload.validAfter,
    validBefore: structured.payload.validBefore,
    nonce: structured.payload.nonce,
  });
  const paid = await doPaidFetch<string>(hash, ENDPOINT_URL, { method: 'GET' }, fetch);
  console.log('Paid call status:', paid.status);
  console.log('Paid call body:', paid.data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});