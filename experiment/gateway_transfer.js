import "dotenv/config";
import { randomBytes } from "node:crypto";
import { http, maxUint256, zeroAddress, pad } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, getContract } from "viem";
import * as chains from "viem/chains";

// Gateway contract addresses (same across all networks)
const gatewayWalletAddress = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const gatewayMinterAddress = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";

// USDC contract addresses
const usdcAddresses = {
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  avalancheFuji: "0x5425890298aed601595a70ab815c96711a31bc65",
  arbitrumSepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  arcTestnet: "0x3600000000000000000000000000000000000000",
};

const ARC_TESTNET_DOMAIN_ID = 26;
const BASE_SEPOLIA_DOMAIN_ID = 6;

console.log("🚀 Starting Gateway transfer from ARC-TESTNET to BASE-SEPOLIA...\n");

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
console.log(`📋 Account: ${account.address}`);

// Construct burn intents
console.log("📝 Step 1: Constructing burn intent for ARC-TESTNET → BASE-SEPOLIA transfer...");
const arcBurnIntent = {
  maxBlockHeight: maxUint256,
  maxFee: 10050n, // Should be >= value to cover transfer fee (0.1005 USDC)
  spec: {   
    version: 1,
    sourceDomain: ARC_TESTNET_DOMAIN_ID,
    destinationDomain: BASE_SEPOLIA_DOMAIN_ID,
    sourceContract: gatewayWalletAddress,
    destinationContract: gatewayMinterAddress,
    sourceToken: usdcAddresses.arcTestnet,
    destinationToken: usdcAddresses.baseSepolia,
    sourceDepositor: account.address,
    destinationRecipient: account.address,
    sourceSigner: account.address,
    destinationCaller: zeroAddress,
    value: 10000n, // 0.01 USDC (6 decimals)
    salt: "0x" + randomBytes(32).toString("hex"),
    hookData: "0x",
  },
};
console.log(`✅ Burn intent created: ${arcBurnIntent.spec.value.toString()} USDC (maxFee: ${arcBurnIntent.maxFee.toString()})`);

const domain = { name: "GatewayWallet", version: "1" };

const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
];

const TransferSpec = [
  { name: "version", type: "uint32" },
  { name: "sourceDomain", type: "uint32" },
  { name: "destinationDomain", type: "uint32" },
  { name: "sourceContract", type: "bytes32" },
  { name: "destinationContract", type: "bytes32" },
  { name: "sourceToken", type: "bytes32" },
  { name: "destinationToken", type: "bytes32" },
  { name: "sourceDepositor", type: "bytes32" },
  { name: "destinationRecipient", type: "bytes32" },
  { name: "sourceSigner", type: "bytes32" },
  { name: "destinationCaller", type: "bytes32" },
  { name: "value", type: "uint256" },
  { name: "salt", type: "bytes32" },
  { name: "hookData", type: "bytes" },
];

const BurnIntent = [
  { name: "maxBlockHeight", type: "uint256" },
  { name: "maxFee", type: "uint256" },
  { name: "spec", type: "TransferSpec" },
];

function addressToBytes32(address) {
  // Ensure address is lowercase and pad to 32 bytes (64 hex chars + 0x = 66 chars total)
  const padded = pad(address.toLowerCase(), { size: 32 });
  // Verify it's exactly 66 characters (0x + 64 hex)
  if (padded.length !== 66) {
    throw new Error(`Invalid bytes32 length: ${padded.length}, expected 66`);
  }
  return padded;
}

function burnIntentTypedData(burnIntent) {
  return {
    types: { EIP712Domain, TransferSpec, BurnIntent },
    domain,
    primaryType: "BurnIntent",
    message: {
      ...burnIntent,
      spec: {
        ...burnIntent.spec,
        sourceContract: addressToBytes32(burnIntent.spec.sourceContract),
        destinationContract: addressToBytes32(
          burnIntent.spec.destinationContract,
        ),
        sourceToken: addressToBytes32(burnIntent.spec.sourceToken),
        destinationToken: addressToBytes32(burnIntent.spec.destinationToken),
        sourceDepositor: addressToBytes32(burnIntent.spec.sourceDepositor),
        destinationRecipient: addressToBytes32(
          burnIntent.spec.destinationRecipient,
        ),
        sourceSigner: addressToBytes32(burnIntent.spec.sourceSigner),
        destinationCaller: addressToBytes32(
          burnIntent.spec.destinationCaller ?? zeroAddress,
        ),
      },
    },
  };
}

console.log("✍️  Step 2: Signing burn intent with EIP-712 typed data...");
const arcTypedData = burnIntentTypedData(arcBurnIntent);
// Debug: Verify bytes32 conversion
const spec = arcTypedData.message.spec;
console.log(`   Verifying bytes32 format:`);
console.log(`   sourceContract: ${spec.sourceContract} (length: ${spec.sourceContract.length})`);
console.log(`   sourceToken: ${spec.sourceToken} (length: ${spec.sourceToken.length})`);
const arcSignature = await account.signTypedData(arcTypedData);
// API requires bytes32 addresses (32-byte hex), not regular address strings
const arcRequest = {
  burnIntent: arcTypedData.message, // Use bytes32 version as API requires
  signature: arcSignature,
};
console.log(`✅ Burn intent signed: ${arcSignature.substring(0, 20)}...`);

console.log("🌐 Step 3: Submitting transfer request to Circle Gateway API...");
const request = [arcRequest];

// Debug: Log the request payload (without sensitive data)
const requestPayload = JSON.stringify(request, (_key, value) =>
  typeof value === "bigint" ? value.toString() : value,
);
console.log("📤 Request payload preview:", JSON.stringify({
  burnIntent: {
    maxBlockHeight: request[0].burnIntent.maxBlockHeight.toString(),
    maxFee: request[0].burnIntent.maxFee.toString(),
    spec: {
      version: request[0].burnIntent.spec.version,
      sourceDomain: request[0].burnIntent.spec.sourceDomain,
      destinationDomain: request[0].burnIntent.spec.destinationDomain,
      value: request[0].burnIntent.spec.value.toString(),
    }
  },
  signature: request[0].signature.substring(0, 20) + "..."
}, null, 2));

const response = await fetch(
  "https://gateway-api-testnet.circle.com/v1/transfer",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestPayload,
  },
);

if (!response.ok) {
  const errorBody = await response.json();
  console.error("❌ Gateway API Error Response:");
  console.error(JSON.stringify(errorBody, null, 2));
  throw new Error(`Gateway API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`);
}

const json = await response.json();
console.log(`✅ Transfer request accepted, received attestation and signature`);

// Partial Minter ABI for the methods we need
const gatewayMinterAbi = [
  {
    type: "function",
    name: "gatewayMint",
    inputs: [
      {
        name: "attestationPayload",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

console.log("🔧 Step 4: Setting up BASE-SEPOLIA client and minting contract...");

// Option 1: Use user's account (requires user to have ETH for gas)
// const baseSepoliaClient = createPublicClient({
//   chain: chains["baseSepolia"],
//   account,
//   transport: http(),
// });

// Option 2: Use relayer/service account to pay for gas (gasless for user)
// The relayer account pays for gas, but destinationRecipient still receives the tokens
const relayerAccount = process.env.RELAYER_PRIVATE_KEY 
  ? privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY)
  : account; // Fallback to user account if no relayer configured

const baseSepoliaClient = createPublicClient({
  chain: chains["baseSepolia"],
  account: relayerAccount,
  transport: http(),
});

if (relayerAccount.address !== account.address) {
  console.log(`   Using relayer account: ${relayerAccount.address} (user: ${account.address})`);
  console.log(`   Relayer will pay gas, user will receive tokens`);
} else {
  console.log(`   Using user account: ${account.address} (user pays gas)`);
}

const { attestation, signature } = json;
const baseSepoliaGatewayMinterContract = getContract({
  address: gatewayMinterAddress,
  abi: gatewayMinterAbi,
  client: baseSepoliaClient,
});

console.log("💰 Step 5: Executing gatewayMint on BASE-SEPOLIA...");
const mintTx = await baseSepoliaGatewayMinterContract.write.gatewayMint([
  attestation,
  signature,
]);
console.log(`✅ Mint transaction sent: ${mintTx}`);

console.log("⏳ Waiting for transaction confirmation...");
const receipt = await baseSepoliaClient.waitForTransactionReceipt({ hash: mintTx });
console.log(`🎉 Transfer completed! Minted in block ${receipt.blockNumber}, status: ${receipt.status}`);


