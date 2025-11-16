import { privateKeyToAccount } from 'viem/accounts';
import { WalletNotConfiguredError } from './errors';
import type { PreparedEIP712Payload, WalletTypedDataSigner } from './types';

// Wraps both ethers v5 (_signTypedData) and viem style signers for browser-based flows.
export async function signEIP712PayloadWallet(
  payload: PreparedEIP712Payload,
  signer: WalletTypedDataSigner | undefined
): Promise<`0x${string}`> {
  if (!signer) {
    throw new WalletNotConfiguredError();
  }
  const { domain, types, primaryType, message } = payload;

  const typedMessage = message as unknown as Record<string, unknown>;

  if (typeof signer._signTypedData === 'function') {
    return (await signer._signTypedData(domain, types, typedMessage)) as `0x${string}`;
  }

  if (typeof signer.signTypedData === 'function') {
    const typedArgs = {
      domain,
      types,
      primaryType,
      message: typedMessage,
    };
    const maybePromise = signer.signTypedData(typedArgs as any);
    return (await maybePromise) as `0x${string}`;
  }

  throw new WalletNotConfiguredError();
}

// Deterministic signing path for server processes that control a private key.
export async function signEIP712PayloadPrivateKey(
  privateKey: `0x${string}` | string,
  payload: PreparedEIP712Payload
): Promise<`0x${string}`> {
  const normalizedKey = normalizePrivateKey(privateKey);
  const account = privateKeyToAccount(normalizedKey);
  const typedMessage = payload.message as unknown as Record<string, unknown>;
  const signature = await account.signTypedData({
    domain: payload.domain,
    primaryType: payload.primaryType,
    types: payload.types,
    message: typedMessage,
  });
  return signature as `0x${string}`;
}

// Accepts keys with or without the 0x prefix so env vars remain flexible.
function normalizePrivateKey(privateKey: string): `0x${string}` {
  return (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
}