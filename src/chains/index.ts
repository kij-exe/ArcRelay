// src/chains/index.ts
import { defineChain } from 'viem';
import { sepolia, baseSepolia, avalancheFuji } from 'viem/chains';
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
  | 'ETH-SEPOLIA'
  | 'BASE-SEPOLIA'
  | 'ARC-TESTNET'
  | 'AVAX-FUJI';

export interface ChainConfig {
  viemChain: Chain;
  networkName: string; // Your internal name (e.g., "ethereum-sepolia")
  usdcAddress: Address;
  usdcName: string;
  usdcVersion: string;
  rpcUrl: string;
  circleBlockchain: CircleBlockchain;
}

// Create a configuration map for all supported chains
export const supportedChains: Record<string, ChainConfig> = {
  'ethereum-sepolia': {
    viemChain: sepolia,
    networkName: 'ethereum-sepolia',
    usdcAddress: process.env.ETHEREUM_SEPOLIA_USDC_ADDRESS as Address,
    usdcName: process.env.ETHEREUM_SEPOLIA_USDC_NAME || 'USDC',
    usdcVersion: process.env.ETHEREUM_SEPOLIA_USDC_VERSION || '2',
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL || '',
    circleBlockchain: 'ETH-SEPOLIA',
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
  'avalanche-fuji': {
    viemChain: avalancheFuji,
    networkName: 'avalanche-fuji',
    usdcAddress: process.env.AVALANCHE_FUJI_USDC_ADDRESS as Address,
    usdcName: process.env.AVALANCHE_FUJI_USDC_NAME || 'USDC',
    usdcVersion: process.env.AVALANCHE_FUJI_USDC_VERSION || '2',
    rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || '',
    circleBlockchain: 'AVAX-FUJI',
  },
};