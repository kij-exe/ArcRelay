import '../config/loadEnv';
import express, { Request, Response } from "express";
import {
  createPublicClient,
  http,
  type Address,
} from "viem";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { supportedChains, type ChainConfig, type CircleBlockchain } from "../chains";
import { verifyTransferAuthorization } from "./eip3009";
import type {
  EIP3009Authorization,
  EIP3009PaymentPayload,
  EIP3009Signature,
  PaymentRequirements,
  SupportedNetwork,
  SupportedScheme,
} from "./payments";

interface VerifyRequestBody {
  paymentPayload?: EIP3009PaymentPayload;
  paymentRequirements: PaymentRequirements;
  payer?: Address;
}

interface SettleRequestBody {
  paymentPayload: EIP3009PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

interface Invoice {
  reason: string;
  paymentRequirements: PaymentRequirements;
  payloadTemplate: {
    scheme: SupportedScheme;
    network: SupportedNetwork;
    token: Address;
    recipient: Address;
    amount: string;
    validAfter: number;
    validBefore: number;
    nonceHint: string;
  };
}


const facilitatorPort = process.env.FACILITATOR_PORT || 3002;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID;
const CIRCLE_DCW_API_URL = process.env.CIRCLE_DCW_API_URL || "https://api.circle.com";
const configuredDefaultNetwork = process.env.DEFAULT_NETWORK as SupportedNetwork | undefined;

if (!CIRCLE_API_KEY) {
  console.error("Missing CIRCLE_API_KEY environment variable");
  process.exit(1);
}

if (!CIRCLE_ENTITY_SECRET) {
  console.error("Missing CIRCLE_ENTITY_SECRET environment variable");
  process.exit(1);
}

if (!CIRCLE_WALLET_SET_ID) {
  console.error("Missing CIRCLE_WALLET_SET_ID environment variable");
  process.exit(1);
}

const circleApiKey = CIRCLE_API_KEY as string;
const circleEntitySecret = CIRCLE_ENTITY_SECRET as string;
const circleWalletSetId = CIRCLE_WALLET_SET_ID as string;

type FacilitatorPublicClient = ReturnType<typeof createPublicClient>;

interface CircleWalletInfo {
  id: string;
  address: Address;
  blockchain: CircleBlockchain;
  walletSetId: string;
}

type CircleTransactionState =
  | "CANCELLED"
  | "CLEARED"
  | "COMPLETE"
  | "CONFIRMED"
  | "DENIED"
  | "FAILED"
  | "INITIATED"
  | "QUEUED"
  | "SENT"
  | "STUCK";

interface CircleTransactionData {
  id: string;
  state: CircleTransactionState;
  transactionHash?: string;
}

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: circleApiKey,
  entitySecret: circleEntitySecret,
  baseUrl: CIRCLE_DCW_API_URL,
});
const circleWalletCache: Partial<Record<SupportedNetwork, CircleWalletInfo>> = {};

interface NetworkContext {
  chain: ChainConfig;
  circleWallet: CircleWalletInfo;
  publicClient: FacilitatorPublicClient;
}

const networkContexts: Partial<Record<SupportedNetwork, NetworkContext>> = {};
let availableNetworks: SupportedNetwork[] = [];
let defaultNetwork: SupportedNetwork;
const authorizationStateAbi = [{
  name: "authorizationState",
  type: "function",
  stateMutability: "view",
  inputs: [
    { name: "authorizer", type: "address" },
    { name: "nonce", type: "bytes32" },
  ],
  outputs: [{ name: "", type: "bool" }],
}] as const;

const TRANSFER_WITH_AUTHORIZATION_SIGNATURE =
  "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)";

async function ensureCircleWallet(network: SupportedNetwork, chainConfig: ChainConfig): Promise<CircleWalletInfo> {
  if (circleWalletCache[network]) {
    return circleWalletCache[network] as CircleWalletInfo;
  }

  const listResponse = await circleClient.listWallets({
    blockchain: chainConfig.circleBlockchain,
    walletSetId: circleWalletSetId,
  });
  const existingWallets = listResponse.data?.wallets ?? [];

  let wallet = existingWallets.find((w) => w.state === "LIVE");

  if (!wallet) {
    const createResponse = await circleClient.createWallets({
      walletSetId: circleWalletSetId,
      blockchains: [chainConfig.circleBlockchain],
      count: 1,
      metadata: [{ name: `${network}-facilitator` }],
    });
    const createdWallets = createResponse.data?.wallets ?? [];

    wallet = createdWallets.find((w) => w.state === "LIVE") ?? createdWallets[0];
  }

  if (!wallet || !wallet.address) {
    throw new Error(`Circle did not return a wallet for ${network}`);
  }

  const normalized: CircleWalletInfo = {
    id: wallet.id as string,
    address: wallet.address as Address,
    blockchain: wallet.blockchain as CircleBlockchain,
    walletSetId: wallet.walletSetId as string,
  };

  circleWalletCache[network] = normalized;
  return normalized;
}

async function initializeNetworkContexts(): Promise<void> {
  const entries = Object.entries(supportedChains) as [SupportedNetwork, ChainConfig][];
  for (const [network, chainConfig] of entries) {
    const rpcUrl = chainConfig.rpcUrl || chainConfig.viemChain.rpcUrls.default?.http?.[0];

    if (!rpcUrl) {
      console.warn(`[facilitator] Skipping network ${network} - missing RPC URL`);
      continue;
    }

    if (!chainConfig.usdcAddress) {
      console.warn(`[facilitator] Skipping network ${network} - missing USDC address`);
      continue;
    }

    try {
      const circleWallet = await ensureCircleWallet(network, chainConfig);
      const transport = http(rpcUrl);
      const publicClient = createPublicClient({
        chain: chainConfig.viemChain,
        transport,
      });
      networkContexts[network] = {
        chain: chainConfig,
        circleWallet,
        publicClient,
      };
    } catch (error) {
      console.error(`[facilitator] Failed to initialize network ${network}:`, error);
    }
  }

  availableNetworks = Object.keys(networkContexts) as SupportedNetwork[];

  if (!availableNetworks.length) {
    throw new Error("No networks configured for facilitator");
  }

  defaultNetwork =
    (configuredDefaultNetwork && availableNetworks.includes(configuredDefaultNetwork)
      ? configuredDefaultNetwork
      : availableNetworks[0]) as SupportedNetwork;
}

const app = express();
app.use(express.json());

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function buildInvoice(requirements: PaymentRequirements, reason: string): Invoice {
  const issuedAt = nowSeconds();
  return {
    reason,
    paymentRequirements: requirements,
    payloadTemplate: {
      scheme: requirements.scheme,
      network: requirements.network,
      token: requirements.token,
      recipient: requirements.recipient,
      amount: requirements.amount,
      validAfter: issuedAt,
      validBefore: issuedAt + requirements.maxTimeoutSeconds,
      nonceHint: "<client-supplied 32-byte hex>",
    },
  };
}

function ensureRequirements(req: PaymentRequirements, context: NetworkContext): string | null {
  console.log("[facilitator] verify request", {
    expectedToken: context.chain.usdcAddress,
    providedToken: req.token,
    expectedRecipient: context.circleWallet.address,
    providedRecipient: req.recipient,
    network: req.network,
    amount: req.amount,
  });

  if (req.scheme !== "exact") {
    return "Unsupported payment scheme";
  }

  if (!networkContexts[req.network]) {
    return "Unsupported network";
  }

  if (req.token.toLowerCase() !== context.chain.usdcAddress.toLowerCase()) {
    return "Unsupported token";
  }

  if (req.recipient.toLowerCase() !== context.circleWallet.address.toLowerCase()) {
    return "Recipient does not match Circle wallet address";
  }

  if (BigInt(req.amount) <= 0) {
    return "Amount must be positive";
  }

  return null;
}





function toAuthorization(payload: EIP3009PaymentPayload): EIP3009Authorization {
  return {
    from: payload.payload.from as Address,
    to: payload.payload.to as Address,
    value: payload.payload.value,
    validAfter: Number(payload.payload.validAfter),
    validBefore: Number(payload.payload.validBefore),
    nonce: payload.payload.nonce,
  };
}

function toSignature(payload: EIP3009PaymentPayload): EIP3009Signature {
  return {
    v: payload.payload.v as number,
    r: payload.payload.r as `0x${string}`,
    s: payload.payload.s as `0x${string}`,
  };
}





// Verifies if the authorization is valid and not already used
async function verifyAuthorization(
  paymentPayload: EIP3009PaymentPayload,
  requirements: PaymentRequirements,
  context: NetworkContext
): Promise<{ authorization: EIP3009Authorization; signature: EIP3009Signature }> {
  const auth = toAuthorization(paymentPayload);
  const sig = toSignature(paymentPayload);

  if (paymentPayload.scheme !== "exact" || paymentPayload.network !== requirements.network) {
    throw new Error("Payment payload network mismatch");
  }

  if (paymentPayload.payload.value !== requirements.amount) {
    throw new Error("Payment amount mismatch");
  }

  if (paymentPayload.payload.to.toLowerCase() !== requirements.recipient.toLowerCase()) {
    throw new Error("Payment recipient mismatch");
  }

  const recovered = await verifyTransferAuthorization(
    auth,
    sig,
    requirements.token,
    context.chain.usdcName,
    context.chain.usdcVersion,
    context.chain.viemChain.id
  );

  if (!recovered || recovered.toLowerCase() !== auth.from.toLowerCase()) {
    throw new Error("Invalid EIP-3009 signature");
  }

  const alreadyUsed = await context.publicClient.readContract({
    address: requirements.token,
    abi: authorizationStateAbi,
    functionName: "authorizationState",
    args: [auth.from, auth.nonce],
  });

  if (alreadyUsed) {
    throw new Error("Authorization already used");
  }

  const nowTs = nowSeconds();
  if (nowTs <= auth.validAfter) {
    throw new Error("Authorization not yet valid");
  }
  if (nowTs >= auth.validBefore) {
    throw new Error("Authorization expired");
  }

  return { authorization: auth, signature: sig };
}




app.get("/supported", (_req: Request, res: Response) => {
  res.json({
    kinds: availableNetworks.map((network) => ({
      x402Version: 1,
      scheme: "exact" as SupportedScheme,
      network,
    })),
  });
});

app.get("/networks", (_req: Request, res: Response) => {
  const networks = availableNetworks
    .map((network) => {
      const context = networkContexts[network];
      if (!context) {
        return null;
      }
      return {
        network,
        token: context.chain.usdcAddress,
        recipient: context.circleWallet.address,
        usdcName: context.chain.usdcName,
        usdcVersion: context.chain.usdcVersion,
        chainId: context.chain.viemChain.id,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  res.json({ networks });
});

app.post("/verify", async (req: Request, res: Response) => {
  try {
    const body = req.body as VerifyRequestBody;
    const requirements = body.paymentRequirements;
    const context = requirements ? networkContexts[requirements.network] : undefined;

    if (!requirements) {
      res.status(400).json({ error: "Missing payment requirements" });
      return;
    }

    if (!context) {
      res.status(400).json({ error: "Unsupported network" });
      return;
    }

    const reqError = ensureRequirements(requirements, context);
    if (reqError) {
      res.status(400).json({ error: reqError, invoice: buildInvoice(requirements, reqError) });
      return;
    }

    if (!body.paymentPayload) {
      res.status(200).json({
        valid: false,
        error: "Missing payment payload",
        invoice: buildInvoice(requirements, "Payment payload required"),
      });
      return;
    }

    const { authorization } = await verifyAuthorization(body.paymentPayload, requirements, context);

    res.json({
      valid: true,
      payer: authorization.from,
      amount: authorization.value,
      token: requirements.token,
      recipient: requirements.recipient,
      validBefore: authorization.validBefore,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Verification failed";
    const reqBody = req.body as VerifyRequestBody;
    const invoice = reqBody?.paymentRequirements
      ? buildInvoice(reqBody.paymentRequirements, err)
      : undefined;
    res.status(200).json({
      valid: false,
      error: err,
      invoice,
    });
  }
});

app.post("/settle", async (req: Request, res: Response) => {
  try {
    const body = req.body as SettleRequestBody;
    const requirements = body.paymentRequirements;
    const context = requirements ? networkContexts[requirements.network] : undefined;

    if (!requirements) {
      res.status(400).json({ error: "Missing payment requirements" });
      return;
    }

    if (!context) {
      res.status(400).json({ error: "Unsupported network" });
      return;
    }

    const reqError = ensureRequirements(requirements, context);
    if (reqError) {
      res.status(400).json({ error: reqError });
      return;
    }

    if (!body.paymentPayload) {
      res.status(400).json({ error: "Missing payment payload" });
      return;
    }

    const { authorization, signature } = await verifyAuthorization(body.paymentPayload, requirements, context);

    const transactionResponse = await circleClient.createContractExecutionTransaction({
      walletId: context.circleWallet.id,
      contractAddress: requirements.token,
      abiFunctionSignature: TRANSFER_WITH_AUTHORIZATION_SIGNATURE,
      abiParameters: [
        authorization.from,
        authorization.to,
        authorization.value,
        authorization.validAfter,
        authorization.validBefore,
        authorization.nonce,
        signature.v,
        signature.r,
        signature.s,
      ],
      refId: requirements.description,
      fee: {
        type: "level",
        config: { feeLevel: "MEDIUM" },
      },
    });
    const circleTransaction = transactionResponse.data;
    if (!circleTransaction) {
      throw new Error("Circle did not return transaction data");
    }
    const successStates: CircleTransactionState[] = ["CLEARED", "COMPLETE", "CONFIRMED", "SENT"];

    const transactionHash =
      (circleTransaction as { transactionHash?: string | null }).transactionHash ?? null;

    res.json({
      success: successStates.includes(circleTransaction.state),
      circleTransactionId: circleTransaction.id,
      state: circleTransaction.state,
      transactionHash,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Settlement failed";
    res.status(400).json({ error: err });
  }
});

app.get("/invoice", (req: Request, res: Response) => {
  const amount = req.query.amount as string | undefined;
  const description = req.query.description as string | undefined;
  const networkParam = req.query.network as SupportedNetwork | undefined;
  const network = (networkParam && networkContexts[networkParam]) ? networkParam : defaultNetwork;
  const context = networkContexts[network];

  if (!context) {
    res.status(400).json({ error: "Unsupported network" });
    return;
  }

  const requirements: PaymentRequirements = {
    scheme: "exact",
    network,
    token: context.chain.usdcAddress,
    amount: amount || "1000",
    recipient: context.circleWallet.address,
    description: description || "X402 payment",
    maxTimeoutSeconds: 300,
  };

  const invoice = buildInvoice(requirements, "Payment required");
  res.json(invoice);
});

async function bootstrap(): Promise<void> {
  await initializeNetworkContexts();

  app.listen(facilitatorPort, () => {
    console.log(`X402 facilitator listening at http://localhost:${facilitatorPort}`);
    console.log("Active facilitator networks:");
    availableNetworks.forEach((network) => {
      const context = networkContexts[network];
      if (context) {
        console.log(
          ` - ${network}: Circle wallet ${context.circleWallet.address} (${context.circleWallet.id})`
        );
      }
    });
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start facilitator:", error);
  process.exit(1);
});
