import '../config/loadEnv';
import express, { Request, Response } from "express";
import { createPublicClient, createWalletClient, http, publicActions, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
// import { arbitrumSepolia } from "viem/chains";
import { arcTestnet } from "../chains/arc"; 
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

const USDC_NAME = process.env.X402_TOKEN_NAME || "USDC";
const USDC_VERSION = process.env.X402_TOKEN_VERSION || "2";
const rpcUrl = process.env.ARC_TESTNET_RPC_URL;
let signerKey = process.env.QUOTE_SERVICE_PRIVATE_KEY || "";
const usdcAddress = process.env.X402_TOKEN_ADDRESS as Address | undefined;
const facilitatorPort = process.env.FACILITATOR_PORT || 3002;


if (!signerKey) {
  console.error("Missing QUOTE_SERVICE_PRIVATE_KEY environment variable");
  process.exit(1);
}

if (!signerKey.startsWith("0x")) {
  signerKey = `0x${signerKey}`;
}

if (signerKey.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(signerKey)) {
  console.error("Invalid QUOTE_SERVICE_PRIVATE_KEY format");
  process.exit(1);
}

if (!usdcAddress) {
  console.error("Missing X402_TOKEN_ADDRESS environment variable");
  process.exit(1);
}
const activeUsdcAddress = usdcAddress as Address;

const account = privateKeyToAccount(signerKey as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(rpcUrl),
}).extend(publicActions);

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl),
});

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

const transferWithAuthorizationAbi = [{
  name: "transferWithAuthorization",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
  ],
  outputs: [],
}] as const;

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

function ensureRequirements(req: PaymentRequirements): string | null {
  console.log('[facilitator] verify request', {
    expectedToken: activeUsdcAddress,
    providedToken: req.token,
    expectedRecipient: account.address,
    providedRecipient: req.recipient,
    network: req.network,
    amount: req.amount,
  });
  if (req.scheme !== "exact") {
    return "Unsupported payment scheme";
  }
  if (req.network !== "arc-testnet") {
    return "Unsupported network";
  }
  if (req.token.toLowerCase() !== activeUsdcAddress.toLowerCase()) {
    return "Unsupported token";
  }
  if (req.recipient.toLowerCase() !== account.address.toLowerCase()) {
    return "Recipient does not match facilitator payout address";
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

async function verifyAuthorization(
  paymentPayload: EIP3009PaymentPayload,
  requirements: PaymentRequirements
): Promise<{ authorization: EIP3009Authorization; signature: EIP3009Signature }> {
  const auth = toAuthorization(paymentPayload);
  const sig = toSignature(paymentPayload);

  if (paymentPayload.scheme !== "exact" || paymentPayload.network !== "arc-testnet") {
    throw new Error("Payment payload network mismatch");
  }

  if (paymentPayload.payload.to.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("Payment payload recipient mismatch");
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
    USDC_NAME,
    USDC_VERSION,
    arcTestnet.id
  );

  if (!recovered || recovered.toLowerCase() !== auth.from.toLowerCase()) {
    throw new Error("Invalid EIP-3009 signature");
  }

  const alreadyUsed = await publicClient.readContract({
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
    kinds: [{
      x402Version: 1,
      scheme: "exact",
      network: "arc-testnet",
    }],
  });
});

app.post("/verify", async (req: Request, res: Response) => {
  try {
    const body = req.body as VerifyRequestBody;
    const requirements = body.paymentRequirements;

    if (!requirements) {
      res.status(400).json({ error: "Missing payment requirements" });
      return;
    }

    const reqError = ensureRequirements(requirements);
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

    const { authorization } = await verifyAuthorization(body.paymentPayload, requirements);

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

    if (!requirements) {
      res.status(400).json({ error: "Missing payment requirements" });
      return;
    }

    const reqError = ensureRequirements(requirements);
    if (reqError) {
      res.status(400).json({ error: reqError });
      return;
    }

    if (!body.paymentPayload) {
      res.status(400).json({ error: "Missing payment payload" });
      return;
    }

    const { authorization, signature } = await verifyAuthorization(body.paymentPayload, requirements);

    const hash: Hex = await walletClient.writeContract({
      address: requirements.token,
      abi: transferWithAuthorizationAbi,
      functionName: "transferWithAuthorization",
      args: [
        authorization.from,
        authorization.to,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce,
        signature.v,
        signature.r,
        signature.s,
      ],
    });

    const receipt = await walletClient.waitForTransactionReceipt({ hash });

    res.json({
      success: receipt.status === "success",
      transactionHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed?.toString() || null,
      status: receipt.status === "success" ? "confirmed" : "failed",
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Settlement failed";
    res.status(400).json({ error: err });
  }
});

app.get("/invoice", (req: Request, res: Response) => {
  const amount = req.query.amount as string | undefined;
  const description = req.query.description as string | undefined;
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: "arc-testnet",
    token: activeUsdcAddress,
    amount: amount || "1000",
    recipient: account.address as Address,
    description: description || "X402 payment",
    maxTimeoutSeconds: 300,
  };

  const invoice = buildInvoice(requirements, "Payment required");
  res.json(invoice);
});

app.listen(facilitatorPort, () => {
  console.log(`X402 facilitator listening at http://localhost:${facilitatorPort}`);
  console.log(`Accepting payments on ${arcTestnet.name}`);
});
