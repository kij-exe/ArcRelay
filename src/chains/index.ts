// src/chains/index.ts
import { defineChain } from 'viem';
import { arbitrumSepolia, baseSepolia } from 'viem/chains';
import type { Address, Chain } from 'viem';

// Define Arc Testnet
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [process.env.ARC_TESTNET_RPC_URL || ''] } },
});

// Define a type for our chain configuration
export type CircleBlockchain =
  | 'ARB-SEPOLIA'
  | 'BASE-SEPOLIA'
  | 'ARC-TESTNET';

export interface ChainConfig {
  viemChain: Chain;
  networkName: string; // Your internal name (e.g., "arbitrum-sepolia")
  usdcAddress: Address;
  usdcName: string;
  usdcVersion: string;
  rpcUrl: string;
  circleBlockchain: CircleBlockchain;
}

// Create a configuration map for all supported chains
export const supportedChains: Record<string, ChainConfig> = {
  'arbitrum-sepolia': {
    viemChain: arbitrumSepolia,
    networkName: 'arbitrum-sepolia',
    usdcAddress: process.env.ARBITRUM_SEPOLIA_USDC_ADDRESS as Address,
    usdcName: process.env.ARBITRUM_SEPOLIA_USDC_NAME || 'TestUSDC',
    usdcVersion: process.env.ARBITRUM_SEPOLIA_USDC_VERSION || '1',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || '',
    circleBlockchain: 'ARB-SEPOLIA',
  },
  'base-sepolia': {
    viemChain: baseSepolia,
    networkName: 'base-sepolia',
    usdcAddress: process.env.BASE_SEPOLIA_USDC_ADDRESS as Address,
    usdcName: process.env.BASE_SEPOLIA_USDC_NAME || 'USDC',
    usdcVersion: process.env.BASE_SEPOLIA_USDC_VERSION || '2',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || '',
    circleBlockchain: 'BASE-SEPOLIA',
  },
  'arc-testnet': {
    viemChain: arcTestnet,
    networkName: 'arc-testnet',
    usdcAddress: process.env.ARC_TESTNET_USDC_ADDRESS as Address,
    usdcName: process.env.ARC_TESTNET_USDC_NAME || 'USDC',
    usdcVersion: process.env.ARC_TESTNET_USDC_VERSION || '2',
    rpcUrl: process.env.ARC_TESTNET_RPC_URL || '',
    circleBlockchain: 'ARC-TESTNET',
  },
};