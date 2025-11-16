import '../config/loadEnv';
import express, { NextFunction, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, watch, mkdirSync } from 'fs';
import path from 'path';
import { parse as parseYAML } from 'yaml';
import type { Address } from 'viem';
import { decodePaymentHeader, generateNonce } from '../facilitator/eip3009';
import type {
  EIP3009PaymentPayload,
  PaymentRequirements,
  SupportedNetwork,
  SupportedScheme,
} from '../facilitator/payments';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

interface EndpointConfig {
  method: HttpMethod;
  path: string;
  price?: string | null;
  description?: string;
  token?: Address | null;
  payTo?: Address | null;
  facilitatorUrl: string;
  network?: SupportedNetwork;
  scheme?: SupportedScheme;
  maxTimeoutSeconds?: number | null;
  autoSettle?: boolean;
  active?: boolean;
}

interface ProxyConfig {
  serviceName?: string;
  upstreamBaseUrl: string;
  endpoints: EndpointConfig[];
}

type ConfiguredEndpoint = EndpointConfig & {
  price: string;
  description: string;
  token: Address;
  payTo: Address;
  network: SupportedNetwork;
  maxTimeoutSeconds: number;
  scheme: SupportedScheme;
};

interface LoadedEndpoint extends ConfiguredEndpoint {
  matcher: RegExp;
  originalPath: string;
}

interface OpenAPIObject {
  info?: {
    title?: string;
    description?: string;
  };
  paths?: Record<string, Record<string, any>>;
}

function resolveConfiguredPath(providedPath: string | undefined, fallbackRelative: string): string {
  const trimmed = providedPath?.trim();
  if (trimmed) {
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  }
  return path.resolve(process.cwd(), fallbackRelative);
}

function ensureParentDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const HTTP_METHOD_SET = new Set<HttpMethod>(HTTP_METHODS);
const DEFAULT_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'http://localhost:3002';
const DEFAULT_UPSTREAM_URL = process.env.X402_DEFAULT_UPSTREAM || 'http://localhost:8080';
const parsedTimeout = Number(process.env.X402_DEFAULT_TIMEOUT_SECONDS ?? '300');
const DEFAULT_TIMEOUT_SECONDS = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 300;
const DEFAULT_NETWORK: SupportedNetwork = (process.env.X402_DEFAULT_NETWORK as SupportedNetwork) || 'arbitrum-sepolia';
const DEFAULT_SCHEME: SupportedScheme = 'exact';
const DEFAULT_TOKEN_NAME = process.env.X402_TOKEN_NAME || 'Test USDC';
const DEFAULT_TOKEN_VERSION = process.env.X402_TOKEN_VERSION || '1';
const DEFAULT_CHAIN_ID = Number(process.env.X402_CHAIN_ID || 421614);
const DEFAULT_TOKEN_ADDRESS = parseAddress(
  process.env.X402_TOKEN_ADDRESS || process.env.X402_TOKEN_ADDRESS || ''
);
const DEFAULT_PAYTO_ADDRESS = parseAddress(
  process.env.X402_PAYTO_ADDRESS || process.env.X402_PAY_TO_ADDRESS || ''
);

const CONFIG_PATH = resolveConfiguredPath(process.env.X402_CONFIG_PATH, 'config.json');
const OPENAPI_PATH = resolveConfiguredPath(process.env.X402_OPENAPI_PATH, 'openapi.json');
const OPENAPI_SERVE_PATH = '/openapi.json';
const PORT = Number(process.env.PORT || 4000);

ensureConfigFile();

interface FacilitatorNetworkMetadata {
  network: SupportedNetwork;
  token: Address;
  recipient: Address;
  chainId: number;
  tokenName: string;
  tokenVersion: string;
}

type FacilitatorNetworkMap = Record<SupportedNetwork, FacilitatorNetworkMetadata>;

const facilitatorNetworkCache: Record<string, FacilitatorNetworkMap> = {};
const facilitatorNetworkPromises: Record<string, Promise<void>> = {};

function normalizeFacilitatorUrl(url: string | undefined): string {
  const value = url && url.trim().length ? url.trim() : DEFAULT_FACILITATOR_URL;
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function ensureFacilitatorNetworks(baseUrl: string): Promise<void> {
  const normalized = normalizeFacilitatorUrl(baseUrl);
  if (facilitatorNetworkCache[normalized]) {
    return;
  }
  if (!facilitatorNetworkPromises[normalized]) {
    facilitatorNetworkPromises[normalized] = (async () => {
      const response = await fetch(`${normalized}/networks`);
      if (!response.ok) {
        throw new Error(`Failed to load facilitator networks from ${normalized}`);
      }
      const data = (await response.json()) as {
        networks?: Array<{
          network: SupportedNetwork;
          token: Address;
          recipient: Address;
          chainId?: number;
          usdcName?: string;
          usdcVersion?: string;
        }>;
      };
      const map: FacilitatorNetworkMap = {};
      for (const item of data.networks ?? []) {
        const key = item.network as SupportedNetwork;
        map[key] = {
          network: key,
          token: item.token as Address,
          recipient: item.recipient as Address,
          chainId: item.chainId ?? DEFAULT_CHAIN_ID,
          tokenName: item.usdcName || DEFAULT_TOKEN_NAME,
          tokenVersion: item.usdcVersion || DEFAULT_TOKEN_VERSION,
        };
      }
      facilitatorNetworkCache[normalized] = map;
    })().catch((error) => {
      delete facilitatorNetworkPromises[normalized];
      console.error('[gateway] Failed to load facilitator networks:', error);
      throw error;
    });
  }
  return facilitatorNetworkPromises[normalized];
}

function getFacilitatorNetworks(baseUrl: string): FacilitatorNetworkMap {
  const normalized = normalizeFacilitatorUrl(baseUrl);
  return facilitatorNetworkCache[normalized] || {};
}

interface PendingNonce {
  expiresAt: number;
}

const pendingNonces = new Map<string, PendingNonce>();

function loadJSONFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function ensureConfigFile(): void {
  let needsBootstrap = !existsSync(CONFIG_PATH);

  if (!needsBootstrap) {
    const existing = readFileSync(CONFIG_PATH, 'utf-8');
    if (!existing.trim()) {
      console.warn(`[gateway] ${CONFIG_PATH} is empty. Regenerating from ${OPENAPI_PATH}.`);
      needsBootstrap = true;
    }
  }

  if (!needsBootstrap) {
    return;
  }

  if (!existsSync(OPENAPI_PATH)) {
    throw new Error(
      `[gateway] Missing ${path.basename(CONFIG_PATH)} and OpenAPI spec at ${OPENAPI_PATH}. Provide one of them to bootstrap the gateway.`
    );
  }
  generateInitialConfig();
}

function loadOpenAPISpec(): OpenAPIObject {
  const raw = readFileSync(OPENAPI_PATH, 'utf-8');
  const ext = path.extname(OPENAPI_PATH).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    return parseYAML(raw) as OpenAPIObject;
  }
  return JSON.parse(raw) as OpenAPIObject;
}

function generateInitialConfig() {
  const spec = loadOpenAPISpec();
  const endpoints = buildEndpointSkeleton(spec);
  const autoConfig: ProxyConfig = {
    serviceName: spec.info?.title || 'x402 Gateway',
    upstreamBaseUrl: DEFAULT_UPSTREAM_URL,
    endpoints,
  };
  ensureParentDirectory(CONFIG_PATH);
  writeFileSync(CONFIG_PATH, JSON.stringify(autoConfig, null, 2));
  writeDocsManifest(autoConfig);
  console.log(
    `[gateway] Generated config skeleton at ${CONFIG_PATH} with ${endpoints.length} endpoint(s) from ${OPENAPI_PATH}. Visit /conf to finish setup.`
  );
}

function buildEndpointSkeleton(spec: OpenAPIObject): EndpointConfig[] {
  const endpoints: EndpointConfig[] = [];
  const paths = spec.paths || {};
  for (const [route, methods] of Object.entries(paths)) {
    if (!methods) continue;
    for (const [methodKey, operation] of Object.entries(methods)) {
      const upper = methodKey.toUpperCase();
      if (!isHttpMethod(upper)) {
        continue;
      }
      const description =
        (operation && (operation as any).summary) ||
        (operation && (operation as any).description) ||
        `${upper} ${route}`;
      endpoints.push({
        method: upper,
        path: route,
        description,
        price: null,
        token: DEFAULT_TOKEN_ADDRESS,
        payTo: DEFAULT_PAYTO_ADDRESS,
        facilitatorUrl: DEFAULT_FACILITATOR_URL,
        network: DEFAULT_NETWORK,
        scheme: DEFAULT_SCHEME,
        maxTimeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        autoSettle: true,
        active: false,
      });
    }
  }
  if (!endpoints.length) {
    endpoints.push({
      method: 'GET',
      path: '/example',
      description: 'Example endpoint',
      price: null,
      token: DEFAULT_TOKEN_ADDRESS,
      payTo: DEFAULT_PAYTO_ADDRESS,
      facilitatorUrl: DEFAULT_FACILITATOR_URL,
      network: DEFAULT_NETWORK,
      scheme: DEFAULT_SCHEME,
      maxTimeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
      autoSettle: true,
      active: false,
    });
  }
  return endpoints;
}

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHOD_SET.has(value as HttpMethod);
}

function buildNonceKey(endpoint: { method: string; originalPath?: string; path: string }, nonce: `0x${string}`): string {
  const route = endpoint.originalPath || endpoint.path;
  return `${endpoint.method.toUpperCase()}::${route}::${nonce}`;
}

function cleanupExpiredNonces(nowSeconds: number): void {
  for (const [key, entry] of pendingNonces.entries()) {
    if (entry.expiresAt <= nowSeconds) {
      pendingNonces.delete(key);
    }
  }
}

function writeDocsManifest(_config: ProxyConfig): void {
  // Docs manifest disabled; handled by frontend if needed
  return;
}

function issueNonce(endpoint: LoadedEndpoint): { nonce: `0x${string}`; validAfter: number; validBefore: number } {
  const nonce = generateNonce();
  const validAfter = Math.floor(Date.now() / 1000);
  const validBefore = validAfter + endpoint.maxTimeoutSeconds;
  cleanupExpiredNonces(validAfter);
  pendingNonces.set(buildNonceKey(endpoint, nonce), { expiresAt: validBefore });
  return { nonce, validAfter, validBefore };
}

function consumeNonce(endpoint: LoadedEndpoint, nonce: `0x${string}`): boolean {
  const now = Math.floor(Date.now() / 1000);
  cleanupExpiredNonces(now);
  const key = buildNonceKey(endpoint, nonce);
  return pendingNonces.delete(key);
}

function isEndpointReady(endpoint: EndpointConfig): endpoint is ConfiguredEndpoint {
  if (endpoint.active === false) {
    return false;
  }
  const priceValue = endpoint.price ?? '';
  const timeout = endpoint.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  return Boolean(
    typeof priceValue === 'string' &&
      priceValue.trim().length > 0 &&
      endpoint.description &&
      endpoint.description.trim().length > 0 &&
      timeout > 0
  );
}

function normalizeEndpoint(endpoint: EndpointConfig): ConfiguredEndpoint {
  if (!isEndpointReady(endpoint)) {
    throw new Error('Attempted to normalize an incomplete endpoint');
  }
  // Token/recipient are resolved by the facilitator at runtime per-network.
  // Keep placeholders to satisfy type shape but they are not used for settlement.
  const token = (endpoint.token ||
    (DEFAULT_TOKEN_ADDRESS as Address) ||
    ('0x0000000000000000000000000000000000000000' as Address)) as Address;
  const payTo = (endpoint.payTo ||
    (DEFAULT_PAYTO_ADDRESS as Address) ||
    ('0x0000000000000000000000000000000000000000' as Address)) as Address;
  return {
    ...endpoint,
    price: endpoint.price,
    description: endpoint.description,
    token,
    payTo,
    network: endpoint.network || DEFAULT_NETWORK,
    maxTimeoutSeconds: endpoint.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    scheme: endpoint.scheme || DEFAULT_SCHEME,
    facilitatorUrl: endpoint.facilitatorUrl || DEFAULT_FACILITATOR_URL,
    autoSettle: endpoint.autoSettle === false ? false : true,
  };
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

function pathToRegex(p: string): RegExp {
  const escaped = p
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/{[^/}]+}/g, '[^/]+')
    .replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

function buildMatcher(config: ConfiguredEndpoint): LoadedEndpoint {
  const scheme = config.scheme || DEFAULT_SCHEME;
  return {
    ...config,
    scheme,
    originalPath: config.path,
    matcher: pathToRegex(config.path),
  };
}

class ConfigManager {
  private config: ProxyConfig;
  private endpoints: LoadedEndpoint[] = [];
  private listeners: Array<(cfg: ProxyConfig) => void> = [];

  constructor() {
    this.config = loadJSONFile<ProxyConfig>(CONFIG_PATH);
    this.validateAgainstOpenAPI();
    this.reloadEndpoints();
    watch(CONFIG_PATH, () => {
      if (!existsSync(CONFIG_PATH)) {
        generateInitialConfig();
        return;
      }
      try {
        this.config = loadJSONFile<ProxyConfig>(CONFIG_PATH);
        this.validateAgainstOpenAPI();
        this.reloadEndpoints();
        this.listeners.forEach((cb) => cb(this.config));
        console.log('[gateway] Config hot-reloaded');
      } catch (error) {
        console.error('[gateway] Failed to reload config:', error);
      }
    });
  }

  private validateAgainstOpenAPI(): void {
    if (!existsSync(OPENAPI_PATH)) {
      return;
    }
    const spec = loadOpenAPISpec();
    if (!spec.paths) {
      return;
    }
    for (const endpoint of this.config.endpoints) {
      const methods = spec.paths[endpoint.path];
      if (!methods) {
        console.warn(`[gateway] Config path ${endpoint.path} not found in OpenAPI spec`);
        continue;
      }
      if (!methods[endpoint.method.toLowerCase()]) {
        console.warn(`[gateway] Method ${endpoint.method} ${endpoint.path} missing in OpenAPI spec`);
      }
    }
  }

  private reloadEndpoints(): void {
    this.endpoints = this.config.endpoints
      .filter((ep) => ep.active !== false && isEndpointReady(ep))
      .map((ep) => buildMatcher(normalizeEndpoint(ep)));
  }

  public getConfig(): ProxyConfig {
    return this.config;
  }

  public getEndpoints(): LoadedEndpoint[] {
    return this.endpoints;
  }

  public findEndpoint(method: string, requestPath: string): LoadedEndpoint | undefined {
    return this.endpoints.find(
      (ep) =>
        ep.method.toUpperCase() === method.toUpperCase() &&
        ep.matcher.test(requestPath)
    );
  }

  public hasPendingEndpoint(method: string, requestPath: string): boolean {
    return this.config.endpoints.some(
      (ep) =>
        ep.method.toUpperCase() === method.toUpperCase() &&
        ep.path === requestPath &&
        ep.active !== false &&
        !isEndpointReady(ep)
    );
  }

  public onUpdate(listener: (cfg: ProxyConfig) => void): void {
    this.listeners.push(listener);
  }
}

// Admin token bootstrap removed; configuration is managed via JWT-authenticated endpoints

function hasBearerAuthorization(req: Request): boolean {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || Array.isArray(auth)) return false;
  const value = String(auth);
  if (!value.toLowerCase().startsWith('bearer ')) return false;
  const token = value.slice(7).trim();
  return token.length > 0;
}

function requireBearerOnly() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (hasBearerAuthorization(req)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  };
}

async function proxyRequest(req: Request, res: Response, upstreamBaseUrl: string, paymentHeader?: string) {
  const url = new URL(req.originalUrl, upstreamBaseUrl);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (
      ['host', 'content-length', 'x-payment', 'x-token', 'authorization'].includes(
        key.toLowerCase()
      )
    ) {
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(',') : value;
  }

  const bodyChunks: Buffer[] = [];
  for await (const chunk of req) {
    bodyChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const body = bodyChunks.length ? Buffer.concat(bodyChunks) : undefined;

  console.log(`Upstream request sent url: ${url}, method: ${req.method}, body: ${body}`);
  const upstreamResponse = await fetch(url, {
    method: req.method,
    headers,
    body: body ?? null,
  });
  console.log(`Upstream response received ${upstreamResponse}`);

  res.status(upstreamResponse.status);
  upstreamResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  if (paymentHeader) {
    res.setHeader('X-Payment-Response', paymentHeader);
    res.setHeader('X-Token-Response', paymentHeader);
  }
  const arrayBuffer = await upstreamResponse.arrayBuffer();
  res.send(Buffer.from(arrayBuffer));
}

function getFacilitatorNetworkMetadata(
  baseUrl: string,
  network: SupportedNetwork
): FacilitatorNetworkMetadata | null {
  const normalized = normalizeFacilitatorUrl(baseUrl);
  const map = facilitatorNetworkCache[normalized];
  if (!map) return null;
  return map[network] || null;
}

function createRequirementForNetwork(
  endpoint: LoadedEndpoint,
  metadata: FacilitatorNetworkMetadata
): PaymentRequirements {
  return {
    scheme: endpoint.scheme || 'exact',
    network: metadata.network,
    token: metadata.token,
    amount: endpoint.price,
    recipient: metadata.recipient,
    description: endpoint.description,
    maxTimeoutSeconds: endpoint.maxTimeoutSeconds,
  };
}

async function buildPaymentRequirement(
  endpoint: LoadedEndpoint,
  network: SupportedNetwork
): Promise<PaymentRequirements> {
  const facilitatorUrl = normalizeFacilitatorUrl(endpoint.facilitatorUrl);
  await ensureFacilitatorNetworks(facilitatorUrl);
  const metadata = getFacilitatorNetworkMetadata(facilitatorUrl, network);
  if (!metadata) {
    throw new Error(`Network ${network} not supported by facilitator`);
  }
  return createRequirementForNetwork(endpoint, metadata);
}

async function verifyPayment(endpoint: LoadedEndpoint, paymentPayload: EIP3009PaymentPayload) {
  const network = (paymentPayload.network as SupportedNetwork) || DEFAULT_NETWORK;
  const requirements = await buildPaymentRequirement(endpoint, network);

  console.log(`Building payment requirements ${requirements}`);
  const verifyRes = await fetch(`${endpoint.facilitatorUrl}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentPayload,
      paymentRequirements: requirements,
    }),
  });

  if (!verifyRes.ok) {
    const data = await verifyRes.json().catch(() => ({}));
    const invoice = data.invoice;
    const error = data.error || 'Payment verification failed';
    throw Object.assign(new Error(error), { invoice });
  }

  const verifyData = await verifyRes.json() as { valid: boolean; error?: string };
  if (!verifyData.valid) {
    throw new Error(verifyData.error || 'Invalid payment');
  }

  let settlementHeader: string | undefined;

  if (endpoint.autoSettle) {
    const settleRes = await fetch(`${endpoint.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements: requirements,
      }),
    });
    if (!settleRes.ok) {
      const data = await settleRes.json().catch(() => ({}));
      throw new Error(data.error || 'Settlement failed');
    }
    const result = await settleRes.json();
    settlementHeader = Buffer.from(
      JSON.stringify({
        status: result.success ? 'completed' : 'failed',
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        amount: requirements.amount,
        token: requirements.token,
        settled: result.success,
      })
    ).toString('base64');
  } else {
    settlementHeader = Buffer.from(
      JSON.stringify({
        status: 'verified',
        transactionHash: null,
        blockNumber: null,
        amount: requirements.amount,
        token: requirements.token,
        settled: false,
      })
    ).toString('base64');
  }

  return { paymentPayload, paymentResponseHeader: settlementHeader };
}

async function respondWithPaymentRequired(
  res: Response,
  endpoint: LoadedEndpoint,
  message = 'Payment Required'
): Promise<void> {
  const facilitatorUrl = normalizeFacilitatorUrl(endpoint.facilitatorUrl);
  await ensureFacilitatorNetworks(facilitatorUrl);
  const networks = Object.values(getFacilitatorNetworks(facilitatorUrl));
  if (!networks.length) {
    res.status(503).json({ error: 'Facilitator networks unavailable' });
    return;
  }

  // Best-effort: pull JSON Schema for successful response from OpenAPI
  let outputSchema: any | null = null;
  try {
    const spec = loadOpenAPISpec();
    const op = (spec.paths?.[endpoint.originalPath] as any)?.[endpoint.method.toLowerCase()];
    const responses = op?.responses as any;
    const candidate =
      responses?.['200'] ||
      responses?.['201'] ||
      responses?.['2XX'] ||
      responses?.['default'];
    const content = candidate?.content || {};
    const appJson =
      content['application/json'] ||
      content['application/*+json'] ||
      Object.values(content)[0];
    outputSchema = appJson?.schema ?? null;
  } catch {
    outputSchema = null;
  }

  const nonceInfo = issueNonce(endpoint);
  const accepts = networks.map((metadata) => {
    const requirements = createRequirementForNetwork(endpoint, metadata);
    return {
      scheme: requirements.scheme,
      network: requirements.network,
      maxAmountRequired: requirements.amount,
      resource: `${endpoint.method} ${endpoint.originalPath}`,
      description: endpoint.description,
      mimeType: 'application/json',
      outputSchema,
      payTo: requirements.recipient,
      maxTimeoutSeconds: requirements.maxTimeoutSeconds,
      asset: requirements.token,
      eip712Domain: {
        name: metadata.tokenName || DEFAULT_TOKEN_NAME,
        version: metadata.tokenVersion || DEFAULT_TOKEN_VERSION,
        chainId: metadata.chainId ?? DEFAULT_CHAIN_ID,
        verifyingContract: requirements.token,
      },
      nonce: nonceInfo.nonce,
    };
  });

  res.status(402).json({
    x402Version: 1,
    error: message,
    accepts,
  });
}

export function startGatewayServer(): void {
  const configManager = new ConfigManager();
  writeDocsManifest(configManager.getConfig());

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Token, X-Payment, Authorization');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  configManager.onUpdate((cfg) => {
    writeDocsManifest(cfg);
  });

  // JSON-only aliases protected by Bearer (JWT) OR admin token for the frontend
  app.get('/config', requireBearerOnly(), (_req, res) => {
    res.json(configManager.getConfig());
  });
  app.post('/config', requireBearerOnly(), (req, res) => {
    const newConfig = req.body as ProxyConfig;
    try {
      ensureParentDirectory(CONFIG_PATH);
      writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
      res.json({ ok: true });
    } catch (error) {
      console.error('[gateway] Failed to write config:', error);
      res.status(500).json({ error: 'Failed to update config' });
    }
  });

  app.get(OPENAPI_SERVE_PATH, (_req, res) => {
    try {
      const spec = loadOpenAPISpec();
      res.json(spec);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message || 'Failed to load OpenAPI spec' });
    }
  });

  // Docs endpoints removed

  app.use(async (req, res) => {
    try {
      console.log(`Request received ${req.method} : ${req.path}`);
      const endpoint = configManager.findEndpoint(req.method, req.path);
      if (!endpoint) {
        console.log("Endpoint not found");
        if (configManager.hasPendingEndpoint(req.method, req.path)) {
          res.status(501).json({
            error: 'Endpoint not configured',
            message: 'Complete pricing setup via the admin dashboard before exposing this endpoint.',
            resource: `${req.method.toUpperCase()} ${req.path}`,
          });
          return;
        }
        await proxyRequest(req, res, configManager.getConfig().upstreamBaseUrl);
        return;
      }
      console.log("Endpoint found");

      const paymentHeader =
        getHeaderValue(req.headers['x-payment']) ?? getHeaderValue(req.headers['x-token']);

      if (!paymentHeader) {
        await respondWithPaymentRequired(res, endpoint);
        return;
      }
      console.log("Payment header found");

      const paymentPayload = decodePaymentHeader(paymentHeader);
      if (!paymentPayload) {
        await respondWithPaymentRequired(res, endpoint, 'Invalid payment payload');
        return;
      }
      console.log("Payment payload is valid");

      const nonceUsed = paymentPayload.payload.nonce;
      if (!nonceUsed || !consumeNonce(endpoint, nonceUsed)) {
        await respondWithPaymentRequired(res, endpoint, 'Invoice expired – request a new payment');
        return;
      }
      console.log("Registered new unique nonce");

      const verification = await verifyPayment(endpoint, paymentPayload);
      console.log("Verification processed");
      await proxyRequest(
        req,
        res,
        configManager.getConfig().upstreamBaseUrl,
        verification.paymentResponseHeader
      );
    } catch (error) {
      const invoice = (error as any)?.invoice;
      res.status(402).json({
        x402Version: 1,
        error: (error as Error).message || 'Payment verification failed',
        invoice,
      });
    }
  });

  app.listen(PORT, () => {
    console.log(`[gateway] listening on http://localhost:${PORT}`);
    console.log('[gateway] proxying to', configManager.getConfig().upstreamBaseUrl);
  });
}

// Admin dashboard announcement removed – dashboard is handled by the separate frontend

if (require.main === module) {
  startGatewayServer();
}
function parseAddress(value: string | undefined | null): Address | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('0x')) {
    return null;
  }
  return trimmed as Address;
}

function resolveAddress(value: Address | null | undefined, fallback?: Address | null): Address | null {
  return value ?? fallback ?? null;
}