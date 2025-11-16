import type { Address } from 'viem';
import type { SupportedNetwork, SupportedScheme, X402PaymentRequirement } from '../facilitator/payments';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface EndpointDocsEntry {
  id?: string;
  method: HttpMethod;
  path: string;
  url?: string;
  description?: string;
  price?: string | null;
  payTo?: Address | null;
  asset?: Address | null;
  network?: SupportedNetwork;
  scheme?: SupportedScheme;
  maxTimeoutSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface X402DocsFile {
  version: number;
  generatedAt: string;
  serviceName: string;
  network: SupportedNetwork;
  scheme: SupportedScheme;
  token: {
    name: string;
    version: string;
    address: Address;
    chainId: number;
    decimals?: number;
  };
  defaults: {
    price?: string | null;
    payTo: Address;
    asset?: Address;
    maxTimeoutSeconds: number;
  };
  endpoints: EndpointDocsEntry[];
}

export interface ResolvedEndpointDoc {
  id: string;
  method: HttpMethod;
  path: string;
  url?: string;
  description?: string;
  price: string;
  payTo: Address;
  asset: Address;
  network: SupportedNetwork;
  scheme: SupportedScheme;
  maxTimeoutSeconds: number;
  metadata?: Record<string, unknown>;
}

export interface PaymentRequirementResponse {
  x402Version: number;
  error: string;
  accepts?: X402PaymentRequirement[];
}

export interface TransferAuthorizationMessage {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

export interface PreparedEIP712Payload {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    TransferWithAuthorization: Array<{ name: string; type: string }>;
  };
  primaryType: 'TransferWithAuthorization';
  message: TransferAuthorizationMessage;
  network: SupportedNetwork;
  scheme: SupportedScheme;
  nonce: `0x${string}`;
  docsEntry?: ResolvedEndpointDoc | null;
  offer: X402PaymentRequirement;
  rawResponse: PaymentRequirementResponse;
}

export type FetchLike = typeof fetch;

export interface RequestArguments {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: RequestInit['body'] | Record<string, unknown> | unknown[] | null;
}

export interface PayPerRequestOptions extends RequestArguments {
  parseAs?: 'json' | 'text' | 'raw';
  timeoutMs?: number;
}

export interface PayPerRequestResult<T = unknown> {
  ok: boolean;
  status: number;
  headers: Headers;
  data: T | string | ArrayBuffer | null;
  response: Response;
}

export interface WalletTypedDataSigner {
  _signTypedData?(domain: unknown, types: unknown, value: unknown): Promise<string>;
  signTypedData?(
    args:
      | {
          domain: unknown;
          types: Record<string, Array<{ name: string; type: string }>>;
          primaryType: string;
          message: Record<string, unknown>;
        }
      | [string, string]
  ): Promise<string>;
}

export interface GenerateEIP712PayloadOptions extends RequestArguments {
  payerAddress?: Address;
  docsEntry?: ResolvedEndpointDoc;
  defaultValiditySeconds?: number;
  fetch?: FetchLike;
  docsResolver?: () => Promise<ResolvedEndpointDoc | null>;
  domainOverride?: PreparedEIP712Payload['domain'];
  networkOverride?: SupportedNetwork;
  schemeOverride?: SupportedScheme;
  nonceOverride?: `0x${string}`;
  now?: () => number;
}