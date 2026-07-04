/**
 * @cookiemunch/sdk — a small, typed REST client for the Cookie Munch Developer API
 * (the /v1 surface). Construct it with an API key; the org is derived server-side
 * from the key, so callers never pass an orgId. `fetch` is injectable for testing
 * and non-browser/non-Node runtimes; it defaults to the global fetch.
 *
 *   const fc = createCookieMunch({ apiKey: 'fck_…', baseUrl: 'https://cmp.example.com' });
 *   const sites = await fc.sites.list();
 */

export * from './types.js';
import type {
  Identity,
  Site,
  SiteCreate,
  SiteConfig,
  ConsentDay,
  ConsentLogRow,
  RangeQuery,
  LogQuery,
  DsarRequest,
  DsarCreate,
  DsarStatus,
  ScoredVendor,
  VendorInput,
  RopaEntry,
  RopaInput,
  SignedReceipt,
} from './types.js';

export interface CookieMunchOptions {
  apiKey: string;
  /** e.g. "https://cmp.example.com" — the /v1 prefix is appended automatically. */
  baseUrl: string;
  /** Injectable for tests / custom runtimes. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** Thrown for any non-2xx response. `message` is the server's `error` field when present. */
export class CookieMunchApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'CookieMunchApiError';
    this.status = status;
    if (code !== undefined) this.code = code;
  }
}

/*
 * Additional /v1 response shapes. These live here (rather than in types.ts) but are
 * still re-exported from the package root via `export * from './types.js'` above plus
 * these top-level `export interface` declarations.
 */

/** A cookie discovered on a site, classified into a consent category. */
export interface SiteCookie {
  name: string;
  domain: string;
  category: string;
  provider?: string;
  purpose?: string;
  expiry?: string;
  firstSeen?: number;
}

/** The state/result of a site cookie scan. */
export interface ScanResult {
  scanId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  startedAt?: number;
  finishedAt?: number;
  pagesScanned?: number;
  cookiesFound?: number;
}

/** A/B banner experiment results for a single variant. */
export interface AbResult {
  variant: string;
  impressions: number;
  optIn: number;
  optOut: number;
  optInRate: number;
}

/** The response shape of GET /v1/sites/:cbid/snippet. */
// Keep in sync with packages/server/src/snippet.ts InstallSnippet
export interface InstallSnippet {
  /** The exact `<script>` tag to paste into `<head>`. */
  snippet: string;
  /** URL of the consent.js embed file (the embed/CDN origin). */
  src: string;
  /** The API origin (beacons + consent-tcf.js). Present when the server reports it. */
  api?: string;
  /** The site identifier. */
  cbid: string;
  /** The active blocking mode. */
  blockingMode: string;
}

/** Options for the snippet endpoint. */
export interface SnippetOptions {
  /** Override the blocking mode ('auto' | 'manual' | 'checklist'). Default: 'auto'. */
  blockingMode?: 'auto' | 'manual' | 'checklist';
  /** Language culture override, e.g. "en" or "fr". */
  culture?: string;
}

/**
 * The result of domain verification.
 * Keep in sync with the POST /v1/sites/:cbid/verify response in
 * packages/server/src/dev-api.ts (~L267) — note the server adds `method` on success,
 * so this wire shape is wider than domain-verify.ts's internal VerifyResult.
 */
export interface VerifyResult {
  verified: boolean;
  method?: 'dns' | 'meta' | 'file';
  reason?: string;
}

/** A site brand suggestion ("Match my site"). Keep in sync with packages/server/src/brand-extract.ts BrandSuggestion. */
export interface BrandSuggestion {
  background?: string;
  text?: string;
  highlight?: string;
  fontFamily?: string;
  fontUrl?: string;
  palette?: string[];
}

/** The response shape of POST /v1/sites/:cbid/brand. */
export interface BrandExtractionResult {
  suggestion: BrandSuggestion;
}

/** A validation/lint issue on a v2 banner flow. */
export interface FlowIssue {
  code: string;
  message: string;
  path?: string;
}

/** A site's v2 banner flow + lint issues, from GET /v1/sites/:cbid/flow. */
export interface SiteFlow {
  v: 2;
  flow: Record<string, unknown>;
  categories: Record<string, unknown>;
  customCss?: string;
  lint: FlowIssue[];
}

/**
 * A single structured flow edit operation. `op` selects the kind; remaining fields are
 * that op's args (e.g. { op: 'addView', id, surface, layoutMode }).
 */
export type FlowOp = { op: string } & Record<string, unknown>;

/**
 * Result of editFlow/setFlow. On success the new flow is persisted and returned;
 * on a validation/lint failure the config is NOT saved and `issues` says why.
 */
export type FlowOpResponse =
  | { ok: true; flow: Record<string, unknown> }
  | { ok: false; failedAt?: number; op?: unknown; issues: FlowIssue[] };

/** A reusable brand kit (colors/logo/typography) for banner theming. */
export interface BrandKit {
  id: string;
  orgId: string;
  name: string;
  colors?: Record<string, string>;
  logoUrl?: string;
  font?: string;
  createdAt: number;
}

/** A configurable consent preference/purpose item. */
export interface PreferenceItem {
  id: string;
  orgId: string;
  cbid?: string;
  label: string;
  description?: string;
  category?: string;
}

/** An organization member. */
export interface Member {
  id: string;
  orgId: string;
  email: string;
  role: string;
  createdAt: number;
}

/** An API key. `secret` is present only in the response that first issues the key. */
export interface ApiKey {
  id: string;
  orgId: string;
  prefix: string;
  name?: string;
  createdAt: number;
  lastUsedAt?: number;
  secret?: string;
}

/** Input for issuing a new API key. */
export interface ApiKeyIssueInput {
  name?: string;
}

/** Org usage/quota summary. */
export interface Usage {
  orgId: string;
  plan: string;
  period: { from: number; to: number };
  consents: number;
  sites: number;
  limit?: number;
}

/** A webhook subscription. `secret` is present only in the create response. */
export interface WebhookSubscription {
  id: string;
  orgId: string;
  url: string;
  secret?: string;
  events: string[];
  cbid: string | null;
  active: boolean;
  createdAt: number;
}

/** Input for creating a webhook subscription. */
export interface WebhookCreate {
  url: string;
  events: string[];
  cbid?: string;
}

/** Input for creating a brand kit. */
export interface BrandKitCreate {
  name: string;
  theme: unknown;
  content?: unknown;
  logoUrl?: string;
  customCss?: string;
}

/** A lightweight summary of an account-level banner, as returned by GET /v1/banners. */
export interface BannerSummary {
  id: string;
  name: string;
  updatedAt: number;
  assignedCbids: string[];
}

/** A full account-level banner record, including its config JSON. */
export interface BannerRecord {
  id: string;
  orgId: string;
  name: string;
  json: SiteConfig;
  createdAt: number;
  updatedAt: number;
}

export interface CookieMunchClient {
  me(): Promise<Identity>;
  sites: {
    list(): Promise<Site[]>;
    create(input: SiteCreate): Promise<Site>;
    get(cbid: string): Promise<Site>;
    delete(cbid: string): Promise<void>;
    getConfig(cbid: string): Promise<SiteConfig>;
    putConfig(cbid: string, config: SiteConfig): Promise<SiteConfig>;
    cookies(cbid: string): Promise<SiteCookie[]>;
    scan(cbid: string): Promise<ScanResult>;
    scanStatus(cbid: string): Promise<ScanResult>;
    ab(cbid: string): Promise<AbResult[]>;
    snippet(cbid: string, opts?: SnippetOptions): Promise<InstallSnippet>;
    verify(cbid: string, method: 'dns' | 'meta' | 'file'): Promise<VerifyResult>;
    brand(cbid: string): Promise<BrandExtractionResult>;
    /** Read a site's v2 banner flow (views, categories) plus any lint issues. */
    getFlow(cbid: string): Promise<SiteFlow>;
    /** Apply an ordered batch of structured edit ops; validated + persisted if lint-clean. */
    editFlow(cbid: string, operations: FlowOp[]): Promise<FlowOpResponse>;
    /** Wholesale-replace the flow with a full v2 config; validated + persisted if valid. */
    setFlow(cbid: string, config: Record<string, unknown>): Promise<FlowOpResponse>;
  };
  consent: {
    stats(cbid: string, query?: RangeQuery): Promise<ConsentDay[]>;
    log(cbid: string, query?: LogQuery): Promise<ConsentLogRow[]>;
    export(cbid: string, query?: RangeQuery): Promise<string>;
    receipt(cbid: string, stamp: string): Promise<SignedReceipt>;
    /** Crypto-erase a subject's consent records by their consent-receipt stamp. Irreversible. */
    eraseSubject(cbid: string, stamp: string): Promise<{ erased: number }>;
    /** Export a data subject's consent records by their consent-receipt stamp (GDPR access/portability). */
    exportSubject(cbid: string, stamp: string): Promise<{ cbid: string; stamp: string; records: unknown[]; count: number }>;
  };
  dsar: {
    list(): Promise<DsarRequest[]>;
    create(input: DsarCreate): Promise<{ request: DsarRequest }>;
    advance(id: string, toStatus: DsarStatus): Promise<{ request: DsarRequest }>;
  };
  vendors: {
    list(): Promise<ScoredVendor[]>;
    create(input: VendorInput): Promise<{ vendor: Record<string, unknown>; risk: { score: number; band: string } }>;
  };
  ropa: {
    list(): Promise<RopaEntry[]>;
    create(input: RopaInput): Promise<{ entry: RopaEntry }>;
  };
  brandKits: {
    list(): Promise<BrandKit[]>;
    create(input: BrandKitCreate): Promise<{ kit: BrandKit }>;
    delete(id: string): Promise<void>;
  };
  preferences: {
    list(): Promise<PreferenceItem[]>;
    save(subjectId: string, purposes: Record<string, boolean>): Promise<unknown>;
  };
  members: {
    list(): Promise<Member[]>;
    invite(email: string, role: string): Promise<{ member: { userId: string; email: string; role: string } }>;
    setRole(userId: string, role: string): Promise<{ member: { userId: string; email: string; role: string } }>;
    remove(userId: string): Promise<unknown>;
  };
  keys: {
    list(): Promise<ApiKey[]>;
    issue(input?: ApiKeyIssueInput): Promise<ApiKey>;
  };
  usage(): Promise<Usage>;
  webhooks: {
    list(): Promise<WebhookSubscription[]>;
    create(input: WebhookCreate): Promise<WebhookSubscription>;
    delete(id: string): Promise<void>;
  };
  banners: {
    list(): Promise<BannerSummary[]>;
    create(input: { name: string; json: SiteConfig }): Promise<BannerRecord>;
    get(id: string): Promise<BannerRecord>;
    update(id: string, patch: { name?: string; json?: SiteConfig }): Promise<BannerRecord>;
    delete(id: string): Promise<void>;
    assignments(id: string): Promise<{ cbids: string[] }>;
    setAssignments(id: string, cbids: string[]): Promise<{ cbids: string[] }>;
    publish(id: string): Promise<{ publishedCbids: string[] }>;
  };
}

function qs(query: Record<string, number | string | undefined> | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Widen a typed query interface (RangeQuery/LogQuery) to the plain record qs() wants. */
function toQuery(q: RangeQuery | LogQuery | undefined): Record<string, number | string | undefined> | undefined {
  return q as Record<string, number | string | undefined> | undefined;
}

export function createCookieMunch(opts: CookieMunchOptions): CookieMunchClient {
  const base = `${opts.baseUrl.replace(/\/+$/, '')}/v1`;
  const doFetch = opts.fetch ?? globalThis.fetch;
  if (!doFetch) throw new Error('No fetch available; pass { fetch } in CookieMunchOptions.');

  async function request(method: string, path: string, body?: unknown, raw = false): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${opts.apiKey}` };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await doFetch(`${base}${path}`, init);
    if (!res.ok) {
      let message = `request failed with status ${res.status}`;
      let code: string | undefined;
      try {
        const data = (await res.json()) as { error?: string; code?: string };
        if (typeof data.error === 'string') message = data.error;
        if (typeof data.code === 'string') code = data.code;
      } catch {
        /* non-JSON error body — keep the default message */
      }
      throw new CookieMunchApiError(res.status, message, code);
    }
    if (res.status === 204) return undefined;
    if (raw) return res.text();
    const contentType = res.headers.get('content-type') ?? '';
    return contentType.includes('application/json') ? res.json() : res.text();
  }

  const get = (p: string) => request('GET', p);
  const enc = encodeURIComponent;

  return {
    me: () => get('/me') as Promise<Identity>,
    sites: {
      list: () => get('/sites') as Promise<Site[]>,
      create: (input) => request('POST', '/sites', input) as Promise<Site>,
      get: (cbid) => get(`/sites/${enc(cbid)}`) as Promise<Site>,
      delete: async (cbid) => {
        await request('DELETE', `/sites/${enc(cbid)}`);
      },
      getConfig: (cbid) => get(`/sites/${enc(cbid)}/config`) as Promise<SiteConfig>,
      putConfig: (cbid, config) => request('PUT', `/sites/${enc(cbid)}/config`, config) as Promise<SiteConfig>,
      cookies: (cbid) => get(`/sites/${enc(cbid)}/cookies`) as Promise<SiteCookie[]>,
      scan: (cbid) => request('POST', `/sites/${enc(cbid)}/scan`) as Promise<ScanResult>,
      scanStatus: (cbid) => get(`/sites/${enc(cbid)}/scan`) as Promise<ScanResult>,
      ab: (cbid) => get(`/sites/${enc(cbid)}/ab`) as Promise<AbResult[]>,
      snippet: (cbid, opts) =>
        get(`/sites/${enc(cbid)}/snippet${qs({ blockingmode: opts?.blockingMode, culture: opts?.culture })}`) as Promise<InstallSnippet>,
      verify: (cbid, method) => request('POST', `/sites/${enc(cbid)}/verify`, { method }) as Promise<VerifyResult>,
      brand: (cbid) => request('POST', `/sites/${enc(cbid)}/brand`, {}) as Promise<BrandExtractionResult>,
      getFlow: (cbid) => get(`/sites/${enc(cbid)}/flow`) as Promise<SiteFlow>,
      editFlow: (cbid, operations) =>
        request('POST', `/sites/${enc(cbid)}/flow/ops`, { operations }) as Promise<FlowOpResponse>,
      setFlow: (cbid, config) => request('PUT', `/sites/${enc(cbid)}/flow`, config) as Promise<FlowOpResponse>,
    },
    consent: {
      stats: (cbid, query) => get(`/sites/${enc(cbid)}/consent/stats${qs(toQuery(query))}`) as Promise<ConsentDay[]>,
      log: (cbid, query) => get(`/sites/${enc(cbid)}/consent/log${qs(toQuery(query))}`) as Promise<ConsentLogRow[]>,
      export: (cbid, query) => request('GET', `/sites/${enc(cbid)}/consent/export${qs(toQuery(query))}`, undefined, true) as Promise<string>,
      receipt: (cbid, stamp) => get(`/sites/${enc(cbid)}/receipt/${enc(stamp)}`) as Promise<SignedReceipt>,
      eraseSubject: (cbid, stamp) =>
        request('POST', `/sites/${enc(cbid)}/erase-consent`, { stamp }) as Promise<{ erased: number }>,
      exportSubject: (cbid, stamp) =>
        request('GET', `/sites/${enc(cbid)}/subject-export?stamp=${enc(stamp)}`) as Promise<{ cbid: string; stamp: string; records: unknown[]; count: number }>,
    },
    dsar: {
      list: () => get('/dsar') as Promise<DsarRequest[]>,
      create: (input) => request('POST', '/dsar', input) as Promise<{ request: DsarRequest }>,
      advance: (id, toStatus) => request('POST', `/dsar/${enc(id)}/advance`, { toStatus }) as Promise<{ request: DsarRequest }>,
    },
    vendors: {
      list: () => get('/vendors') as Promise<ScoredVendor[]>,
      create: (input) => request('POST', '/vendors', input) as Promise<{ vendor: Record<string, unknown>; risk: { score: number; band: string } }>,
    },
    ropa: {
      list: () => get('/ropa') as Promise<RopaEntry[]>,
      create: (input) => request('POST', '/ropa', input) as Promise<{ entry: RopaEntry }>,
    },
    brandKits: {
      list: () => get('/brand-kits') as Promise<BrandKit[]>,
      create: (input) => request('POST', '/brand-kits', input) as Promise<{ kit: BrandKit }>,
      delete: async (id) => {
        await request('DELETE', `/brand-kits/${enc(id)}`);
      },
    },
    preferences: {
      list: () => get('/preferences') as Promise<PreferenceItem[]>,
      save: (subjectId, purposes) => request('POST', '/preferences', { subjectId, purposes }),
    },
    members: {
      list: () => get('/members') as Promise<Member[]>,
      invite: (email, role) =>
        request('POST', '/members', { email, role }) as Promise<{ member: { userId: string; email: string; role: string } }>,
      setRole: (userId, role) =>
        request('PATCH', `/members/${enc(userId)}`, { role }) as Promise<{ member: { userId: string; email: string; role: string } }>,
      remove: (userId) => request('DELETE', `/members/${enc(userId)}`),
    },
    keys: {
      list: () => get('/keys') as Promise<ApiKey[]>,
      issue: (input) => request('POST', '/keys', input ?? {}) as Promise<ApiKey>,
    },
    usage: () => get('/usage') as Promise<Usage>,
    webhooks: {
      list: () => get('/webhooks') as Promise<WebhookSubscription[]>,
      create: (input) => request('POST', '/webhooks', input) as Promise<WebhookSubscription>,
      delete: async (id) => {
        await request('DELETE', `/webhooks/${enc(id)}`);
      },
    },
    banners: {
      list: () => get('/banners') as Promise<BannerSummary[]>,
      create: (input) => request('POST', '/banners', input) as Promise<BannerRecord>,
      get: (id) => get(`/banners/${enc(id)}`) as Promise<BannerRecord>,
      update: (id, patch) => request('PUT', `/banners/${enc(id)}`, patch) as Promise<BannerRecord>,
      delete: async (id) => {
        await request('DELETE', `/banners/${enc(id)}`);
      },
      assignments: (id) => get(`/banners/${enc(id)}/assignments`) as Promise<{ cbids: string[] }>,
      setAssignments: (id, cbids) => request('PUT', `/banners/${enc(id)}/assignments`, { cbids }) as Promise<{ cbids: string[] }>,
      publish: (id) => request('POST', `/banners/${enc(id)}/publish`) as Promise<{ publishedCbids: string[] }>,
    },
  };
}
