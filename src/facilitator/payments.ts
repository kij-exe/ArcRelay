import type { Address } from 'viem';

export type SupportedScheme = 'exact';
export type SupportedNetwork = 'arbitrum-sepolia' | 'arc-testnet';

// EIP-3009 Transfer with Authorization primitives
export interface EIP3009Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: `0x${string}`;
}

export interface EIP3009Signature {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

export interface EIP3009PaymentPayload {
  x402Version: number;
  scheme: SupportedScheme;
  network: SupportedNetwork;
  payload: {
    from: Address;
    to: Address;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: `0x${string}`;
    signature?: `0x${string}`;
    v?: number;
    r?: `0x${string}`;
    s?: `0x${string}`;
  };
}

// Facilitator payment requirement payload (proxy -> facilitator)
export interface PaymentRequirements {
  scheme: SupportedScheme;
  network: SupportedNetwork;
  token: Address;
  amount: string;
  recipient: Address;
  description: string;
  maxTimeoutSeconds: number;
}

// High-level 402 offer the proxy returns to clients
interface EIP712DomainInfo {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export interface X402PaymentRequirement {
  scheme: SupportedScheme;
  network: SupportedNetwork;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: object | null;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  eip712Domain?: EIP712DomainInfo;
  nonce?: `0x${string}`;
}