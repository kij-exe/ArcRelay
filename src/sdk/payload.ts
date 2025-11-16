import type { SupportedNetwork, SupportedScheme } from '../facilitator/payments';
import type { PreparedEIP712Payload } from './types';
import { encodeBase64 } from './utils';

// Canonical JSON envelope that mirrors what the proxy expects in X-Token / X-Payment.
export interface EncodedPaymentPayload {
  x402Version: number;
  scheme: SupportedScheme;
  network: SupportedNetwork;
  payload: PreparedEIP712Payload['message'] & { signature: `0x${string}` };
}

// Returns both the structured payload (for debugging/logs) and the base64 header value.
export function base64Payload(
  payload: PreparedEIP712Payload,
  signature: `0x${string}`
): { hash: string; structured: EncodedPaymentPayload } {
  const structured: EncodedPaymentPayload = {
    x402Version: 1,
    scheme: payload.scheme,
    network: payload.network,
    payload: {
      ...payload.message,
      signature,
    },
  };
  const hash = encodeBase64(JSON.stringify(structured));
  return { hash, structured };
}