import type { Address } from 'viem';
import { UnexpectedResponseError } from './errors';
import type { FetchLike, HttpMethod, RequestArguments } from './types';

// Default deadline for invoices issued by the SDK when the server does not specify one.
export const DEFAULT_VALIDITY_SECONDS = 600;
// Canonical typed data schema shared by wallets and backend signers.
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export const DEFAULT_DOMAIN = {
  name: 'TestUSDC',
  version: '1',
  chainId: 421614,
  verifyingContract: '0xf4983A096c2F71f8aFC4D519AB936B35f8e09256' as Address,
} as const;

// Normalizes user supplied fetch implementations and guarantees one exists.
export function resolveFetch(fetcher?: FetchLike): FetchLike {
  const candidate = fetcher ?? globalThis.fetch;
  if (typeof candidate !== 'function') {
    throw new UnexpectedResponseError('Global fetch is not available in this environment');
  }
  return candidate;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Defensive clone that drops undefined header values so RequestInit stays valid.
export function normalizeHeaders(headers?: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) {
    return normalized;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined' || value === null) continue;
    normalized[key] = value;
  }
  return normalized;
}

// Consolidates loosely specified request arguments into a fetch-ready shape.
export function buildRequestInit(args?: RequestArguments): {
  method: HttpMethod;
  headers: Record<string, string>;
  body: BodyInit | null;
} {
  const method = (args?.method ?? 'GET').toUpperCase() as HttpMethod;
  const headers = normalizeHeaders(args?.headers);
  const incomingBody = args?.body;
  let body: BodyInit | null = null;

  if (isSerializable(incomingBody)) {
    body = JSON.stringify(incomingBody);
    if (!hasContentType(headers)) {
      headers['Content-Type'] = 'application/json';
    }
  } else if (typeof incomingBody !== 'undefined' && incomingBody !== null) {
    body = incomingBody as BodyInit;
  } else if (incomingBody === null) {
    body = null;
  }
  return { method, headers, body };
}

// Encodes JSON payloads for X-Token headers in both Node and browser runtimes.
export function encodeBase64(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64');
  }
  if (typeof btoa === 'function') {
    const binary = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(Number.parseInt(p1, 16))
    );
    return btoa(binary);
  }
  throw new UnexpectedResponseError('Unable to encode payload as base64');
}

function isSerializable(value: unknown): value is Record<string, unknown> | unknown[] {
  if (value === null) return false;
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasContentType(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
}