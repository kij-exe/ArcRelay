import "dotenv/config";
import { createPublicClient, getContract, http, erc20Abi, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
// import * as chains from "viem/chains";

// Define ARC-TESTNET chain configuration
const arcTestnet = defineChain({
    id: 5042002, // ARC-TESTNET chain ID
    name: "ARC Testnet",
    nativeCurrency: {
        decimals: 18,
        name: "USDC",
        symbol: "USDC",
    },
    rpcUrls: {
        default: {
            http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"],
        },
    },
    blockExplorers: {
        default: {
            name: "ARC Testnet Explorer",
            url: "https://testnet.arcscan.app/",
        },
    },
    testnet: true,
});

try {
    console.log("🚀 Starting deposit process on ARC-TESTNET...\n");

    // Partial ABI for the functions needed on the Gateway wallet
    const gatewayWalletAbi = [
        {
            type: "function",
            name: "deposit",
            inputs: [
                {
                    name: "token",
                    type: "address",
                    internalType: "address",
                },
                {
                    name: "value",
                    type: "uint256",
                    internalType: "uint256",
                },
            ],
            outputs: [],
            stateMutability: "nonpayable",
        },
    ];

    // Contract addresses on ARC-TESTNET
    const gatewayWalletAddress = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
    const usdcAddress = "0x3600000000000000000000000000000000000000"; // ARC TESTNET USDC address

    const DEPOSIT_AMOUNT = 10_0000n; // 0.1 USDC (6 decimals)
    
    const rpcUrl = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
    
    console.log("📋 Configuration:");
    console.log(`   Chain: ARC-TESTNET (Chain ID: ${arcTestnet.id})`);
    console.log(`   RPC URL: ${rpcUrl}`);
    console.log(`   Gateway Wallet: ${gatewayWalletAddress}`);
    console.log(`   USDC Address: ${usdcAddress}`);
    console.log(`   Deposit Amount: ${DEPOSIT_AMOUNT.toString()} (0.1 USDC)\n`);

    // Step 1: Setup account and client
    console.log("🔧 Step 1: Setting up account and client...");
    const account = privateKeyToAccount(process.env.PRIVATE_KEY);
    console.log(`   Account Address: ${account.address}`);

    const client = createPublicClient({
        chain: arcTestnet,
        // chain: chains["arcTestnet"],
        account,
        transport: http(),
    });
    console.log("✅ Client initialized\n");

    // Step 2: Get contracts
    console.log("📝 Step 2: Initializing contracts...");
    const usdc = getContract({ address: usdcAddress, abi: erc20Abi, client });
    const gatewayWallet = getContract({
        address: gatewayWalletAddress,
        abi: gatewayWalletAbi,
        client,
    });
    console.log("✅ Contracts initialized\n");

    // Step 3: Approve USDC spending
    console.log("🔐 Step 3: Approving USDC spending...");
    console.log(`   Approving ${DEPOSIT_AMOUNT.toString()} USDC for gateway wallet...`);
    const approvalTx = await usdc.write.approve([
        gatewayWallet.address,
        DEPOSIT_AMOUNT,
    ]);
    console.log(`   ✅ Approval transaction sent: ${approvalTx}`);
    console.log(`   ⏳ Waiting for approval transaction confirmation...`);

    const approvalReceipt = await client.waitForTransactionReceipt({ hash: approvalTx });
    console.log(`   ✅ Approval confirmed in block ${approvalReceipt.blockNumber}`);
    console.log(`   Gas used: ${approvalReceipt.gasUsed.toString()}\n`);

    // Step 4: Deposit to gateway wallet
    console.log("💰 Step 4: Depositing USDC to gateway wallet...");
    console.log(`   Depositing ${DEPOSIT_AMOUNT.toString()} USDC...`);
    const depositTx = await gatewayWallet.write.deposit([
        usdc.address,
        DEPOSIT_AMOUNT,
    ]);
    console.log(`   ✅ Deposit transaction sent: ${depositTx}`);
    console.log(`   ⏳ Waiting for deposit transaction confirmation...`);

    const depositReceipt = await client.waitForTransactionReceipt({ hash: depositTx });
    console.log(`   ✅ Deposit confirmed in block ${depositReceipt.blockNumber}`);
    console.log(`   Gas used: ${depositReceipt.gasUsed.toString()}\n`);

    console.log("🎉 Deposit process completed successfully!");
    console.log(`   Transaction Hash: ${depositTx}`);
    console.log(`   Block: ${depositReceipt.blockNumber}`);
    console.log(`   Status: ${depositReceipt.status}`);

} catch (error) {
    console.error("\n❌ Error during deposit process:");
    console.error(error);
    process.exit(1);
}
  