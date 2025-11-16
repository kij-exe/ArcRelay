import type { Address } from 'viem';
import type { SupportedNetwork, SupportedScheme, X402PaymentRequirement } from '../facilitator/payments';
import { PaymentOfferMissingError, UnexpectedResponseError, WalletNotConfiguredError } from './errors';
import { X402DocsRepository, type DocsSource } from './docs';
import { base64Payload } from './payload';
import { signEIP712PayloadPrivateKey, signEIP712PayloadWallet } from './signing';
import type {
  FetchLike,
  GenerateEIP712PayloadOptions,
  PayPerRequestOptions,
  PayPerRequestResult,
  PreparedEIP712Payload,
  RequestArguments,
  ResolvedEndpointDoc,
  WalletTypedDataSigner,
  PaymentRequirementResponse,
} from './types';
import { buildRequestInit, DEFAULT_DOMAIN, DEFAULT_VALIDITY_SECONDS, nowSeconds, resolveFetch, TRANSFER_WITH_AUTHORIZATION_TYPES } from './utils';

interface PreparePayloadParams {
  endpointUrl: string;
  method: string;
  payerAddress: Address;
  requestInit: {
    method: string;
    headers: Record<string, string>;
    body: BodyInit | null;
  };
  fetcher: FetchLike;
  docsEntry?: ResolvedEndpointDoc | null | undefined;
  docsRepo?: X402DocsRepository | undefined;
  defaultValiditySeconds?: number | undefined;
  domainOverride?: PreparedEIP712Payload['domain'] | undefined;
  networkOverride?: SupportedNetwork | undefined;
  schemeOverride?: SupportedScheme | undefined;
  nonceOverride?: `0x${string}` | undefined;
  now?: (() => number) | undefined;
}

export interface X402SdkOptions {
  docs: DocsSource | X402DocsRepository;
  fetch?: FetchLike;
  defaultValiditySeconds?: number;
  payerAddress?: Address;
  addressResolver?: () => Promise<Address>;
  walletSigner?: WalletTypedDataSigner & { getAddress?: () => Promise<Address> };
}

// High-level helper that strings together pricing lookup, EIP-712 creation, signing, and paid fetches.
export class X402Sdk {
  private readonly docsRepo: X402DocsRepository;
  private readonly fetcher: FetchLike;
  private readonly defaultValiditySeconds: number;
  private readonly staticPayer: Address | undefined;
  private addressResolver: (() => Promise<Address>) | undefined;
  private walletSigner: (WalletTypedDataSigner & { getAddress?: () => Promise<Address> }) | undefined;

  constructor(options: X402SdkOptions) {
    this.docsRepo = options.docs instanceof X402DocsRepository ? options.docs : new X402DocsRepository(options.docs, options.fetch);
    this.fetcher = resolveFetch(options.fetch);
    this.defaultValiditySeconds = options.defaultValiditySeconds ?? DEFAULT_VALIDITY_SECONDS;
    this.staticPayer = options.payerAddress;
    this.addressResolver = options.addressResolver ?? options.walletSigner?.getAddress?.bind(options.walletSigner);
    this.walletSigner = options.walletSigner;
  }

  // Allows hot-swapping wallets after instantiation (useful for browser popups).
  public setWalletSigner(signer: WalletTypedDataSigner & { getAddress?: () => Promise<Address> }): void {
    this.walletSigner = signer;
    if (signer.getAddress) {
      this.addressResolver = signer.getAddress.bind(signer);
    }
  }

  // Fetches the live 402 offer, merges it with docs.json metadata, and returns a typed-data payload.
  public async generateEIP712Payload(
    endpointUrl: string,
    overrides?: GenerateEIP712PayloadOptions
  ): Promise<PreparedEIP712Payload> {
    const requestInit = buildRequestInit(overrides);
    const payerAddress = overrides?.payerAddress ?? (await this.resolvePayerAddress());
    const customDocsEntry = overrides?.docsEntry ?? (overrides?.docsResolver ? await overrides.docsResolver() : undefined);
    const docsEntry =
      typeof customDocsEntry === 'undefined' || customDocsEntry === null
        ? await this.docsRepo.getEndpoint(endpointUrl, requestInit.method)
        : customDocsEntry;

    return prepareEIP712Payload({
      endpointUrl,
      method: requestInit.method,
      payerAddress,
      requestInit,
      fetcher: this.fetcher,
      docsEntry,
      docsRepo: this.docsRepo,
      defaultValiditySeconds: overrides?.defaultValiditySeconds ?? this.defaultValiditySeconds,
      domainOverride: overrides?.domainOverride,
      networkOverride: overrides?.networkOverride,
      schemeOverride: overrides?.schemeOverride,
      nonceOverride: overrides?.nonceOverride,
      now: overrides?.now,
    });
  }

  // Forwards payloads to a wallet/ethers signer while keeping the instance-level fallback.
  public async signEIP712PayloadWallet(
    payload: PreparedEIP712Payload,
    signer?: WalletTypedDataSigner
  ): Promise<`0x${string}`> {
    return signEIP712PayloadWallet(payload, signer ?? this.walletSigner);
  }

  // Backend-style signing path for bots that hold a raw private key.
  public async signEIP712PayloadPrivateKey(
    privateKey: `0x${string}` | string,
    payload: PreparedEIP712Payload
  ): Promise<`0x${string}`> {
    return signEIP712PayloadPrivateKey(privateKey, payload);
  }

  // Produces both the structured payload and base64 string required by the proxy headers.
  public encodePaymentHeader(payload: PreparedEIP712Payload, signature: `0x${string}`) {
    return base64Payload(payload, signature);
  }

  // Executes the paid call by attaching the encoded payload to X-Token / X-Payment headers.
  public async payPerRequest<T = unknown>(
    base64Hash: string,
    endpointUrl: string,
    options?: PayPerRequestOptions
  ): Promise<PayPerRequestResult<T>> {
    return payPerRequest(base64Hash, endpointUrl, options, this.fetcher);
  }

  private async resolvePayerAddress(): Promise<Address> {
    if (this.staticPayer) {
      return this.staticPayer;
    }
    if (this.addressResolver) {
      const address = await this.addressResolver();
      if (address) {
        return address;
      }
    }
    throw new WalletNotConfiguredError();
  }
}

// Convenience factory so consumers can grab a fully wired instance in one call.
export function createX402Sdk(options: X402SdkOptions): X402Sdk {
  return new X402Sdk(options);
}

// Stateless helper mirroring the class method for users who just need one-off payloads.
export async function generateEIP712Payload(
  endpointUrl: string,
  docs: DocsSource | X402DocsRepository,
  options: GenerateEIP712PayloadOptions & { fetch?: FetchLike }
): Promise<PreparedEIP712Payload> {
  const fetcher = resolveFetch(options.fetch);
  const requestInit = buildRequestInit(options);
  const repo = docs instanceof X402DocsRepository ? docs : new X402DocsRepository(docs, options.fetch);
  const customDocsEntry = options.docsEntry ?? (options.docsResolver ? await options.docsResolver() : undefined);
  const docsEntry =
    typeof customDocsEntry === 'undefined' || customDocsEntry === null
      ? await repo.getEndpoint(endpointUrl, requestInit.method)
      : customDocsEntry;

  if (!options.payerAddress) {
    throw new WalletNotConfiguredError();
  }

  return prepareEIP712Payload({
    endpointUrl,
    method: requestInit.method,
    payerAddress: options.payerAddress,
    requestInit,
    fetcher,
    docsEntry,
    docsRepo: repo,
    defaultValiditySeconds: options.defaultValiditySeconds,
    domainOverride: options.domainOverride,
    networkOverride: options.networkOverride,
    schemeOverride: options.schemeOverride,
    nonceOverride: options.nonceOverride,
    now: options.now,
  });
}

// Stateless helper to execute a single paid request without instantiating the SDK.
export async function payPerRequest<T = unknown>(
  base64Hash: string,
  endpointUrl: string,
  options?: PayPerRequestOptions,
  fetcher?: FetchLike
): Promise<PayPerRequestResult<T>> {
  const resolvedFetch = resolveFetch(fetcher);
  const requestInit = buildRequestInit(options);
  requestInit.headers['X-Token'] = base64Hash;
  requestInit.headers['X-Payment'] = base64Hash;

  // Optional AbortController keeps runaway upstream calls from hanging the payment flow.
  const controller =
    typeof options?.timeoutMs === 'number' && options.timeoutMs > 0 ? new AbortController() : undefined;

  const init: RequestInit = {
    method: requestInit.method,
    headers: requestInit.headers,
    body: requestInit.body,
    signal: controller ? controller.signal : null,
  };

  let timeoutRef: ReturnType<typeof setTimeout> | undefined;
  try {
    if (controller && options?.timeoutMs) {
      timeoutRef = setTimeout(() => controller.abort(), options.timeoutMs);
    }
    const response = await resolvedFetch(endpointUrl, init);
    const data = await parseResponse(response, options?.parseAs);
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      data: data as T,
      response,
    };
  } finally {
    if (timeoutRef) {
      clearTimeout(timeoutRef);
    }
  }
}

// Core flow: request the 402 payload, validate the offer, and build typed data ready for signing.
async function prepareEIP712Payload(params: PreparePayloadParams): Promise<PreparedEIP712Payload> {
  const fetchResponse = await params.fetcher(params.endpointUrl, {
    method: params.method,
    headers: params.requestInit.headers,
    body: params.requestInit.body,
  });

  if (fetchResponse.status !== 402) {
    throw new UnexpectedResponseError(
      `Expected 402 payment requirement, received ${fetchResponse.status}`,
      fetchResponse.status
    );
  }

  const paymentResponse = (await safeJson(fetchResponse)) as PaymentRequirementResponse;
  const offers: X402PaymentRequirement[] = paymentResponse.accepts ?? [];
  if (!offers.length) {
    throw new PaymentOfferMissingError();
  }
  const offer = offers[0];
  if (!offer) {
    throw new PaymentOfferMissingError();
  }

  const docsEntry = params.docsEntry ?? null;
  // Prefer server-provided domain, otherwise fall back to docs.json / SDK defaults.
  const domain =
    params.domainOverride ??
    (offer.eip712Domain ?? (params.docsRepo ? await params.docsRepo.getDomain() : DEFAULT_DOMAIN));

  const network = params.networkOverride ?? docsEntry?.network ?? offer.network ?? 'ethereum-sepolia';
  const scheme = params.schemeOverride ?? docsEntry?.scheme ?? offer.scheme ?? 'exact';
  const payerAddress = params.payerAddress;

  // `payTo` and `nonce` are required to produce a valid authorization.
  const payTo = docsEntry?.payTo ?? offer.payTo;
  if (!payTo) {
    throw new UnexpectedResponseError('Unable to build EIP-712 payload: missing recipient address');
  }

  const nonce = params.nonceOverride ?? offer.nonce;
  if (!nonce) {
    throw new UnexpectedResponseError('x402 response did not include a nonce');
  }

  const issuedAt = params.now ? params.now() : nowSeconds();
  const timeoutSeconds =
    docsEntry?.maxTimeoutSeconds ??
    offer.maxTimeoutSeconds ??
    params.defaultValiditySeconds ??
    DEFAULT_VALIDITY_SECONDS;
  // Pricing always comes from docs.json so users can reject unexpectedly high quotes.
  const quotedValue = docsEntry?.price ?? offer.maxAmountRequired ?? '0';
  const value = typeof quotedValue === 'string' ? quotedValue : `${quotedValue}`;

  const message = {
    from: payerAddress,
    to: payTo,
    value,
    validAfter: `${issuedAt}`,
    validBefore: `${issuedAt + timeoutSeconds}`,
    nonce,
  };

  return {
    domain: domain ?? DEFAULT_DOMAIN,
    types: { TransferWithAuthorization: [...TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization] },
    primaryType: 'TransferWithAuthorization',
    message,
    network,
    scheme,
    nonce,
    docsEntry,
    offer,
    rawResponse: paymentResponse,
  };
}

// Parses the facilitator error while surfacing a useful error if the body is not JSON.
async function safeJson(response: Response): Promise<PaymentRequirementResponse> {
  try {
    return (await response.json()) as PaymentRequirementResponse;
  } catch (error) {
    throw new UnexpectedResponseError('Failed to parse 402 response body as JSON', response.status);
  }
}

// Converts fetch responses into the caller's desired shape (json/text/raw) with sensible fallbacks.
async function parseResponse(response: Response, parseAs?: 'json' | 'text' | 'raw'): Promise<unknown> {
  if (parseAs === 'raw') {
    return await response.arrayBuffer();
  }
  if (parseAs === 'text') {
    return await response.text();
  }
  const contentType = response.headers.get('content-type') || '';
  if (!parseAs && contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return await response.text();
    }
  }
  if (parseAs === 'json') {
    return await response.json();
  }
  return await response.text();
}