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
export * from './consent.js';
export * from './webhooks.js';
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
  VendorRecord,
  RiskScore,
  RopaEntry,
  RopaInput,
  SignedReceipt,
  PreferenceRecord,
} from './types.js';

export interface CookieMunchOptions {
  apiKey: string;
  /** e.g. "https://cmp.example.com" — the /v1 prefix is appended automatically. */
  baseUrl: string;
  /** Injectable for tests / custom runtimes. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/**
 * Thrown for any non-2xx response. `message` is the server's `error` field when present;
 * `code` is populated from the server's `code` field whenever the error body carries one
 * (e.g. banner-library conflicts, docs-admin checks) — not only for scoped-key
 * (`insufficient_scope`) responses. It's `undefined` when the body has no `code`.
 */
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

/** A cookie discovered on a site, classified into a consent category (wire shape of the
 *  cookie-declaration feed). Matches the server's CategorizedCookie schema. */
export interface CategorizedCookie {
  name: string;
  category: 'necessary' | 'preferences' | 'statistics' | 'marketing' | 'unclassified' | (string & {});
  domain?: string;
  provider?: string;
  purpose?: string;
  expiry?: string;
}

/** A site's cookie declaration: the latest scan's categorized cookies. This is what
 *  GET /v1/sites/:cbid/cookies actually returns (a wrapper, not a bare array). */
export interface CookieDeclaration {
  /** Epoch-ms of the latest scan, or 0 if none. */
  updatedAt: number;
  cookies: CategorizedCookie[];
}

/** @deprecated The server returns {@link CookieDeclaration}; kept only for back-compat. */
export interface SiteCookie {
  name: string;
  domain: string;
  category: string;
  provider?: string;
  purpose?: string;
  expiry?: string;
  firstSeen?: number;
}

/** Cookie-scan status, from GET /v1/sites/:cbid/scan. */
export interface ScanStatus {
  status: 'idle' | 'scanning';
  /** Epoch-ms of the last completed scan, or null. */
  lastScannedAt: number | null;
}

/** @deprecated The server returns {@link ScanStatus}; kept only for back-compat. */
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
  optIns: number;
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
  /** Banner theme tokens (opaque design object). */
  theme: Record<string, unknown>;
  /** Optional banner content overrides (opaque). */
  content?: Record<string, unknown>;
  logoUrl?: string;
  customCss?: string;
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
  userId: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer' | (string & {});
}

/** Display metadata for an issued key — never the secret. Returned by keys.list(). */
export interface ApiKeyPrefix {
  prefix: string;
  createdAt?: number;
}

/** A newly issued key. `key` is returned ONCE and never again. Returned by keys.issue(). */
export interface ApiKeyIssued {
  key: string;
  prefix: string;
}

/** @deprecated No endpoint returns this shape; use {@link ApiKeyPrefix} / {@link ApiKeyIssued}. */
export interface ApiKey {
  id: string;
  orgId: string;
  prefix: string;
  name?: string;
  createdAt: number;
  lastUsedAt?: number;
  secret?: string;
}

/**
 * Input for issuing a new API key.
 *
 * NOTE: the server's POST /v1/keys currently accepts no body and always mints an
 * unscoped key — `name` is not yet honoured server-side. It's kept here (rather than
 * dropped) so a future scoped/named-key endpoint can start reading it without an SDK
 * major version bump; see {@link CookieMunchClient.keys}.
 */
export interface ApiKeyIssueInput {
  name?: string;
  /** Least privilege: grant only these scopes. Omit for a full-access key. */
  scopes?: string[];
  /**
   * Lock the key to these properties. A locked key works only on those sites and on no
   * org-wide endpoint — see "Keys locked to properties" in the client reference.
   */
  cbids?: string[];
  /** Expire the key after this many days (1–3650). */
  expiresInDays?: number;
}

/** Org usage/quota summary. Matches the server's Usage schema. */
export interface Usage {
  domains: number;
  seats: number;
  monthlyEvents: number;
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

/** One cookie read from another CMP's export. */
export interface ImportedCookie {
  name: string;
  domain: string;
  /** Ours, or `unclassified` when their category did not map to one. */
  category: 'necessary' | 'preferences' | 'statistics' | 'marketing' | 'unclassified';
  /** What the previous vendor called it, kept for review. */
  sourceCategory: string;
  purpose: string;
  provider: string;
  expiry: string;
}

/** What a competitor's cookie-declaration export contained, in our vocabulary. */
export interface ImportedDeclaration {
  source: 'onetrust' | 'cookiebot' | 'cookieyes' | 'unknown';
  cookies: ImportedCookie[];
  /** Rows whose category could not be placed — review these first. */
  unmapped: Array<{ name: string; category: string }>;
}

/**
 * A page that refused to load the banner renderer. The site is live and configured, so
 * every other signal looks healthy; this is the one that says nobody can be asked.
 */
export interface BlockedReport {
  cbid: string;
  /** Origin of the page the embed was running on. */
  page: string;
  /** The bundle URL that page refused. */
  url: string;
  reason: string;
  firstSeen: number;
  lastSeen: number;
  /** How many times this page has reported. Repeats are counted, not stored. */
  count: number;
}

/** A webhook delivery that failed every retry. Replay it by `id`. */
export interface WebhookDeadLetter {
  id: string;
  orgId: string;
  subscriptionId: string;
  url: string;
  eventType: string;
  cbid: string | null;
  payload: unknown;
  attempts: number;
  lastStatus?: number;
  lastError?: string;
  failedAt: number;
}

/** What a test delivery's endpoint answered. */
export interface WebhookTestResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** The key's organisation. */
export interface Org {
  id: string;
  name: string;
  plan: string;
  logoUrl: string | null;
}

/** Change an org's name or logo. `logoUrl: null` removes the logo. */
export interface OrgUpdate {
  name?: string;
  logoUrl?: string | null;
}

/** One entry in the org's audit log. */
export interface AuditEntry {
  id: string;
  orgId: string;
  actorUserId: string;
  actorEmail?: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  at: number;
}

/** Rename a key, or replace its scopes or the properties it is locked to. */
export interface ApiKeyUpdate {
  name?: string;
  scopes?: string[];
  cbids?: string[];
}

/** An image to upload: base64 (or a `data:` URL) plus its type. */
export interface AssetUpload {
  data: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml';
}

/** Result of erasing a subject's consent for a deletion request. */
export interface DsarEraseResult {
  erased: number;
  encryptionEnabled: boolean;
  /** Present when no KEK is configured, so nothing was cryptographically erased. */
  warning?: string;
  request: DsarRequest;
}

/** Result of exporting a subject's consent for an access or portability request. */
export interface DsarExportResult {
  records: unknown[];
  count: number;
  request: DsarRequest;
}

/** Input for creating a webhook subscription. */
export interface WebhookCreate {
  url: string;
  events: string[];
  cbid?: string;
}

/** Fields to change on a webhook subscription. Only those present are sent. */
export interface WebhookUpdate {
  url?: string;
  events?: string[];
  /** One property, or null for every property in the org. */
  cbid?: string | null;
  /** false pauses delivery without deleting the subscription. */
  active?: boolean;
}

/** One site to create in a bulk call. */
export interface BulkSiteInput {
  domain: string;
  cbid?: string;
  platform?: string;
}

/** Per-item outcome of a bulk create, in input order. */
export interface BulkSiteResult {
  ok: boolean;
  cbid?: string;
  domain?: string;
  error?: string;
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

/**
 * Input for the public consent-log ingest endpoint (POST /api/v1/consent) — the
 * tamper-evident, hash-chained ledger write the browser embed makes. Mirrors the
 * server's ConsentPayload; optional fields are sent only when set. Records are
 * anonymised (IP truncated) and hash-chained server-side.
 */
export interface ConsentIngestInput {
  /** The registered site id the consent belongs to. */
  cbid: string;
  /** Stable per-subject consent-receipt id (used for erase/export). */
  stamp: string;
  /** The subject's cookie-category choices. */
  choices: { preferences: boolean; statistics: boolean; marketing: boolean };
  /** How consent was captured. */
  method: 'explicit' | 'implied';
  /** Consent/notice version number. */
  ver: number;
  /** Epoch-ms the decision was made. */
  utc: number;
  /** The URL / screen where consent was captured. */
  url: string;
  /** Optional IAB TCF consent string (TCF mode only). */
  tcString?: string;
  /** Optional GPP string (GPP mode only). */
  gppString?: string;
  /** Optional named-purpose map beyond the standard categories. */
  purposes?: Record<string, boolean>;
  /** Optional opaque digest of the exact notice text shown to the subject. */
  subjectPolicyHash?: string;
  /** Optional map: named purpose → RoPA entry id. */
  purposeRopa?: Record<string, string>;
  /** Optional A/B variant id. */
  variant?: string;
  /**
   * Optional, app-supplied STABLE cross-surface subject id. Lets an org retrieve one
   * subject's consent history across ALL its sites/surfaces (web + mobile + desktop).
   * Opaque — stored and bound into the record hash server-side, never interpreted.
   */
  subjectId?: string;
}

/** One of a person's identifiers: an identity-space code plus the normalised value. */
export interface Identifier {
  space: string;
  value: string;
}

export interface ConsentDecisionInput {
  purpose: string;
  allowed: boolean;
  legalBasis?: string;
  jurisdiction?: string;
  provenance?: string;
  collectedAt?: number;
}

export interface ProfileAttributeInput {
  value: string;
  purpose?: string;
  collectedAt?: number;
}

export interface SubscriptionTopicInput {
  code: string;
  name?: string;
  channels: string[];
  downstream?: Record<string, string>;
}

/** A warehouse-native enforcement rule. See POST /v1/discovery/enforcement. */
export interface EnforcementRuleInput {
  id: string;
  action: 'mask' | 'restrict';
  /** Select columns at or above this sensitivity. */
  minSensitivity?: 'personal' | 'sensitive';
  /** Select columns in any of these categories. */
  categories?: string[];
  /** mask: roles that still see the raw value. */
  allowRoles?: string[];
  /** restrict: the purpose a subject must have consented to. */
  purpose?: string;
  /** restrict: the column holding the subject id. Default SUBJECT_ID. */
  subjectColumn?: string;
}

export interface RegulationSummary {
  id: string;
  jurisdiction: string;
  name: string;
  /** ISO date the law takes (or took) effect. */
  effective: string;
  model: 'opt-in' | 'opt-out';
  obligations: string[];
  /** Primary source — the statute or the regulator. */
  source: string;
}

export interface RegulatoryFeedResult {
  /** When a human last checked the dataset against its sources. */
  reviewedAt: string;
  /** Days since that review. */
  ageDays: number;
  /** How long a review is considered good for. */
  reviewAfterDays: number;
  /** True once the review interval has passed — treat the answer with caution. */
  stale: boolean;
  regulations: RegulationSummary[];
}

export interface AiInspectInput {
  prompt: string;
  purpose: string;
  model?: string;
  actor?: string;
  direction?: 'prompt' | 'response';
  /** The subject's current permits, when the call concerns an identified person. */
  consent?: Record<string, boolean>;
}

export interface AiInspectResult {
  action: 'allow' | 'redact' | 'block';
  /** The text to forward: redacted when `redact`, empty when `block`. */
  prompt: string;
  findings: unknown[];
  reasons: string[];
  policyIds: string[];
  blocked: boolean;
  direction: 'prompt' | 'response';
}

export type FulfillmentOp = 'locate' | 'export' | 'erase' | 'optOut';

/** A child org provisioned by a reseller. */
export interface ResellerChild {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  delegatedAccess?: boolean;
  /** Per-child DSAR routing override; unset defers to the reseller's policy. */
  dsarRouting?: 'reseller' | 'child';
  createdAt?: number;
  usage?: unknown;
}

export interface ResellerChildList {
  children: ResellerChild[];
  /** Pooled usage across the reseller and all its children, when metering is wired. */
  aggregate?: { childOrgs: number; sites: number; monthlyEvents: number; monthlyEventsCap: number | null; overCap: boolean };
}

export interface ResellerChildCreate {
  name: string;
  ownerEmail?: string;
  /** legalName, contactEmail, address, dpoContact. */
  controller?: Record<string, unknown>;
  /** Branding overrides, merged onto the reseller's white-label defaults. */
  whiteLabel?: Record<string, unknown>;
  delegatedAccess?: boolean;
  /** Also issue an API key for the new child; it is returned once, as `apiKey`. */
  mintKey?: boolean;
  /** Scopes for that key. Defaults to ["sites:read"]. */
  keyScopes?: string[];
}

export interface ResellerChildPatch {
  status?: 'active' | 'suspended';
  delegatedAccess?: boolean;
  /** Pin this child's DSAR routing; null clears the override. */
  dsarRouting?: 'reseller' | 'child' | null;
  controller?: Record<string, unknown>;
}

export interface ChildKeyInput {
  name?: string;
  scopes?: string[];
  /** Lock the key to these properties of the child org. */
  cbids?: string[];
}

export interface PolicyOptions {
  /** Contact email shown in the policy. Falls back to the org controller's, then the owner's. */
  contactEmail?: string;
  /** YYYY-MM-DD. Defaults to today. */
  effectiveDate?: string;
  /** Override the jurisdictions the policy addresses. */
  jurisdictions?: string[];
}

export interface AdPersonalizationInput {
  enabled: boolean;
  /** Whether personalised ads start on before the visitor chooses. */
  default?: boolean;
  label?: string;
}

export interface SessionAnalysisInput {
  /** A HAR export of the captured session. */
  har?: unknown;
  /** Or the requests directly. */
  requests?: unknown[];
  /** The consent state the session ran under. */
  consent?: Record<string, boolean>;
  /** Whether Global Privacy Control was set. */
  gpc?: boolean;
}

/**
 * How to drive one system's rights API, as data. This is what makes a connection specific to
 * a platform — Cookie Munch names none of them, so connecting a new system is a profile
 * rather than a release. Paths are relative to `baseUrl`; placeholders are `{email}`,
 * `{subject}`, `{operation}`, `{correlation}` and `{id}`.
 */
export interface ExecutorProfile {
  /** How requests carry the credential. Defaults to `Authorization: Bearer {secret}`. */
  auth?: { header: string; format: string };
  /** Optional first step: turn the subject's email into the id this system uses. */
  subjectLookup?: { method: 'GET' | 'POST'; path: string; body?: unknown; idPath: string };
  /** How to open a request. An operation left out of `operations` is one this system does not run. */
  open: {
    method: 'POST' | 'PUT';
    path: string;
    body?: unknown;
    operations: { export?: string; erase?: string };
    idPath: string;
    statusPath?: string;
  };
  /** How to ask how it is going. Polling is the truth; a webhook only prompts a check. */
  poll: { method?: 'GET'; path: string; statusPath: string; resultPath?: string };
  /** That system's status words → the three answers a sub-task can have. */
  statuses: { running: string[]; done: string[]; failed: string[] };
  idempotencyHeader?: string;
  /** How that system signs its webhooks, if it sends any. */
  webhook?: {
    algorithm: 'hmac-sha256';
    /** Must include `{body}`, or the signature proves nothing about it. */
    signedPayload: string;
    headers: { signature: string; timestamp?: string; id?: string };
    encoding?: 'base64' | 'hex';
    prefix?: string;
    toleranceSeconds?: number;
    timestampUnit?: 'seconds' | 'milliseconds' | 'auto';
  };
}

/** A system connected to run part of a rights request. Credentials are never included. */
export interface DsarExecutor {
  id: string;
  /** The name it answers to in a fulfillment plan, e.g. `identity` or `crm`. */
  system: string;
  profile: ExecutorProfile;
  baseUrl: string;
  keyPrefix: string;
  hasWebhookSecret: boolean;
  /** Open a sub-task automatically when a request reaches fulfilment. */
  auto: boolean;
  createdAt: number;
}

export interface DsarExecutorInput {
  /** The name this connection answers to in a plan, e.g. `identity` or `crm`. */
  system: string;
  /** The system's public https origin. */
  baseUrl: string;
  /** Its API key. Stored encrypted; never returned. */
  secretKey: string;
  /** The signing secret of its webhook endpoint. Optional — polling closes tasks without it. */
  webhookSecret?: string;
  auto?: boolean;
  /** How to drive it. */
  profile: ExecutorProfile;
}

export interface DsarExecutorCreated extends DsarExecutor {
  /** Point the connected system's webhook endpoint here. */
  webhookUrl: string;
}

export interface DsarTaskExport {
  system: string;
  ref: string;
  /** The bundle as that system returned it. Not stored here. */
  bundle: unknown;
}

/** A language the banner already has copy for. */
export interface SupportedLanguage {
  /** BCP-47 tag, lowercase. Matched exactly, then by language prefix. */
  code: string;
  /** English name. */
  name: string;
  /** The language's name in itself. */
  endonym: string;
  /** Written right to left; the banner flips for these. */
  rtl: boolean;
  /** `bundled` ships in consent.js; `extended` ships in the renderer, fetched when a banner is first drawn. */
  source: 'bundled' | 'extended';
}

export interface CookieMunchClient {
  me(): Promise<Identity>;
  /**
   * Languages the banner already speaks. Diff this against the locales your visitors
   * use to see which ones you still need to write copy for in `banner.i18n`.
   */
  languages(): Promise<SupportedLanguage[]>;
  sites: {
    list(): Promise<Site[]>;
    create(input: SiteCreate): Promise<Site>;
    get(cbid: string): Promise<Site>;
    delete(cbid: string): Promise<void>;
    getConfig(cbid: string): Promise<SiteConfig>;
    /** Replaces the whole config — a top-level field you omit reverts to its default. */
    putConfig(cbid: string, config: SiteConfig): Promise<SiteConfig>;
    /** Changes some of the config — omitted fields keep their stored value. */
    patchConfig(cbid: string, config: Partial<SiteConfig>): Promise<SiteConfig>;
    cookies(cbid: string): Promise<CookieDeclaration>;
    scan(cbid: string): Promise<ScanStatus>;
    scanStatus(cbid: string): Promise<ScanStatus>;
    ab(cbid: string): Promise<AbResult[]>;
    /** Generate the site's privacy and cookie policy, as Markdown. */
    policy(cbid: string, opts?: PolicyOptions): Promise<string>;
    /** Turn on the personalised-ads split on whichever banner form the site uses. */
    setAdPersonalization(cbid: string, input: AdPersonalizationInput): Promise<unknown>;
    /** Analyse a captured session: trackers that fired after opt-out, personal data leaving the page. */
    analyzeSession(cbid: string, input: SessionAnalysisInput): Promise<unknown>;
    /** Which banner design this site uses, or null when none is assigned. */
    banner(cbid: string): Promise<{ bannerId: string | null }>;
    /**
     * Pages where the embed could not load its banner renderer — the host page's CSP or
     * Trusted Types policy refused it, so nobody on that page can be asked. An empty list
     * is the healthy answer.
     */
    blocked(cbid: string): Promise<{ reports: BlockedReport[] }>;
    /**
     * Read a cookie declaration exported from another CMP and translate its categories
     * into ours. Nothing is applied: their vocabulary is not ours, and a cookie in the
     * wrong category is a tag firing against a refusal, so the result is for review.
     */
    importDeclaration(cbid: string, data: string): Promise<ImportedDeclaration>;
    snippet(cbid: string, opts?: SnippetOptions): Promise<InstallSnippet>;
    verify(cbid: string, method: 'dns' | 'meta' | 'file' | 'embed'): Promise<VerifyResult>;
    /** Exactly what to publish to prove control of the domain, for each verification method. */
    verifyChallenge(cbid: string): Promise<unknown>;
    /** Create up to 100 sites. Partial success: a bad or duplicate item fails only itself. */
    createBulk(sites: BulkSiteInput[]): Promise<{ results: BulkSiteResult[] }>;
    brand(cbid: string): Promise<BrandExtractionResult>;
    /** Read a site's v2 banner flow (views, categories) plus any lint issues. */
    getFlow(cbid: string): Promise<SiteFlow>;
    /** Apply an ordered batch of structured edit ops; validated + persisted if lint-clean. */
    editFlow(cbid: string, operations: FlowOp[]): Promise<FlowOpResponse>;
    /** Wholesale-replace the flow with a full v2 config; validated + persisted if valid. */
    setFlow(cbid: string, config: Record<string, unknown>): Promise<FlowOpResponse>;
  };
  consent: {
    /**
     * Verify the consent log's tamper-evident hash chain. Each record carries the hash of the
     * one before it, so an edited, reordered or removed record answers `false`. This is the
     * evidence behind the log: proof that what it says today is what it said when written.
     */
    verify(cbid: string): Promise<{ valid: boolean }>;
    stats(cbid: string, query?: RangeQuery): Promise<ConsentDay[]>;
    log(cbid: string, query?: LogQuery): Promise<ConsentLogRow[]>;
    export(cbid: string, query?: RangeQuery): Promise<string>;
    receipt(cbid: string, stamp: string): Promise<SignedReceipt>;
    /** Crypto-erase a subject's consent records by their consent-receipt stamp. Irreversible. */
    eraseSubject(cbid: string, stamp: string): Promise<{ erased: number }>;
    /** Export a data subject's consent records by their consent-receipt stamp (GDPR access/portability). */
    exportSubject(cbid: string, stamp: string): Promise<{ cbid: string; stamp: string; records: unknown[]; count: number }>;
    /** Record a consent decision via the PUBLIC ingest endpoint (POST /api/v1/consent). No `/v1`
     *  prefix and no auth is required by the server (the cbid must be a registered site); for
     *  server-side / non-browser consent flows. Pass `subjectId` to correlate a subject cross-surface. */
    ingest(input: ConsentIngestInput): Promise<void>;
  };
  dsar: {
    list(): Promise<DsarRequest[]>;
    /**
     * One request, in the same shape `list` returns — note that `create` answers with it
     * wrapped as `{ request }`, so `create(...).request.id` is what you pass here.
     */
    get(id: string): Promise<DsarRequest>;
    create(input: DsarCreate): Promise<{ request: DsarRequest }>;
    advance(id: string, toStatus: DsarStatus): Promise<{ request: DsarRequest }>;
    /** The subject-facing response notice for a request, as plain text. */
    response(id: string): Promise<string>;
    /**
     * Erase a subject's consent records on one site, for a deletion request past identity
     * verification. Noted on the request. Requires dsar:write and consent:write.
     */
    erase(id: string, cbid: string, stamp: string): Promise<DsarEraseResult>;
    /**
     * A subject's consent records on one site, for an access or portability request past
     * identity verification. Noted on the request. Requires dsar:write and consent:read.
     */
    export(id: string, cbid: string, stamp: string): Promise<DsarExportResult>;
  };
  vendors: {
    list(): Promise<ScoredVendor[]>;
    create(input: VendorInput): Promise<{ vendor: VendorRecord; risk: RiskScore }>;
  };
  ropa: {
    list(): Promise<RopaEntry[]>;
    create(input: RopaInput): Promise<{ entry: RopaEntry }>;
    /** The org's RoPA (GDPR Art. 30) as CSV. */
    exportCsv(): Promise<string>;
  };
  brandKits: {
    list(): Promise<BrandKit[]>;
    create(input: BrandKitCreate): Promise<{ kit: BrandKit }>;
    delete(id: string): Promise<void>;
  };
  /**
   * Identity resolution. Reads are POSTs on purpose: a person's identifiers travel in the
   * body, never a URL where they would land in access logs.
   */
  identity: {
    /** Canonical subject id for any known identifier, else null. */
    resolve(identifiers: Identifier[]): Promise<{ subjectId: string | null }>;
    /** Stitch identifiers into one subject (merging clusters when a link bridges them). */
    link(identifiers: Identifier[]): Promise<{ subjectId: string }>;
    cluster(subjectId: string): Promise<{ subjectId: string; identifiers: Identifier[] }>;
  };
  /** The Permission Vault: a resolved person's current consent state. */
  vault: {
    record(identifiers: Identifier[], decisions: ConsentDecisionInput[]): Promise<{ subjectId: string; permits: unknown[] }>;
    current(identifiers: Identifier[]): Promise<{ purposes: Record<string, boolean> }>;
    permits(identifiers: Identifier[]): Promise<{ permits: unknown[] }>;
  };
  /** The unified profile, with consent enforced at ACTIVATION time. */
  profile: {
    get(identifiers: Identifier[]): Promise<unknown>;
    setAttributes(identifiers: Identifier[], attributes: Record<string, ProfileAttributeInput>): Promise<{ subjectId: string }>;
    /** Attribute values usable for `purpose` — {} when the person hasn't consented to it. */
    activate(identifiers: Identifier[], purpose: string): Promise<{ attributes: Record<string, string> }>;
  };
  /** Marketing preferences as topics x channels. */
  subscriptions: {
    /** The org's topic catalog — what a subject can subscribe TO. */
    topics(): Promise<{ topics: SubscriptionTopicInput[] }>;
    /** Replace the catalog. It is authored whole, not patched. */
    setTopics(topics: SubscriptionTopicInput[]): Promise<{ topics: SubscriptionTopicInput[] }>;
    get(subjectId: string): Promise<unknown>;
    set(subjectId: string, topic: string, channel: string, optedIn: boolean): Promise<unknown>;
    unsubscribeAll(subjectId: string): Promise<unknown>;
    resubscribe(subjectId: string): Promise<unknown>;
    activation(subjectId: string, topics: SubscriptionTopicInput[]): Promise<{ entries: unknown[] }>;
  };
  /** DPIA / PIA / LIA / TIA / AI-impact / vendor assessments. */
  assessments: {
    templates(): Promise<{ templates: unknown[] }>;
    list(): Promise<{ assessments: unknown[] }>;
    start(template: string, subject: string): Promise<unknown>;
    /** The record plus its derived score, completeness and SME routing. */
    get(id: string): Promise<unknown>;
    answer(id: string, questionId: string, value: string | number | boolean): Promise<unknown>;
    /** Fill from the org's latest data map; never overwrites a human answer. */
    autoPopulateFromMap(id: string): Promise<{ assessment: unknown; applied: string[] }>;
    /** Fill from evidence you supply. Never overwrites a human answer; records `source` as provenance. */
    autoPopulate(id: string, evidence: Record<string, unknown>, source?: string): Promise<{ assessment: unknown; applied: string[] }>;
    submit(id: string): Promise<unknown>;
    approve(id: string, by: string): Promise<unknown>;
    reject(id: string, by: string, reason: string): Promise<unknown>;
  };
  /** The data map produced by an in-environment scan (metadata only). */
  discovery: {
    ingestMap(map: unknown): Promise<{ scannedAt: number; systems: number }>;
    getMap(): Promise<unknown>;
    ropaDrafts(): Promise<{ drafts: unknown[] }>;
    evidence(): Promise<{ evidence: Record<string, unknown> }>;
    /** What changed since the last scan, and where the RoPA disagrees with reality. */
    drift(): Promise<{ comparedTo: number | null; sinceLastScan: unknown[]; againstRecord: unknown[] }>;
    /**
     * Plan warehouse-native policy from the latest map. Returns a PLAN with its own
     * revert — nothing is applied to your warehouse by calling this.
     */
    planEnforcement(
      dialect: 'postgres' | 'mysql' | 'snowflake',
      rules: EnforcementRuleInput[],
      opts?: { permitsTable?: string; policyPrefix?: string },
    ): Promise<{ plan: { statements: unknown[]; revert: unknown[]; skipped: unknown[] } }>;
  };
  /**
   * Regulatory intelligence: the curated privacy-law dataset. Every response carries
   * `reviewedAt` — the dataset ships with the product and is only as current as its
   * last review. Not legal advice.
   */
  regulatory: {
    /** The dataset, optionally narrowed to the jurisdictions you operate in. */
    feed(jurisdictions?: string[]): Promise<RegulatoryFeedResult>;
    /** What takes effect within `days` (default 180), soonest first. */
    upcoming(days?: number): Promise<RegulatoryFeedResult>;
  };
  /** AI governance: policy, the inline gateway, inventory and lineage. */
  ai: {
    getPolicy(): Promise<{ policy: unknown; configured: boolean }>;
    setPolicy(policy: unknown): Promise<{ policy: unknown }>;
    /** Enforce consent + policy on a prompt or response. Requires the ai:inspect scope. */
    inspect(input: AiInspectInput): Promise<AiInspectResult>;
    inventory(): Promise<{ systems: unknown[]; shadow: unknown[] }>;
    lineage(): Promise<{ lineage: Record<string, string[]> }>;
    registerSystem(input: { id: string; name: string; provider?: string; purpose?: string }): Promise<unknown>;
    /** The AI systems declared with registerSystem. */
    systems(): Promise<unknown>;
    audit(limit?: number): Promise<{ entries: unknown[] }>;
  };
  /** DSR fulfillment: plan work per system, poll it from an in-VPC agent, report outcomes. */
  fulfillment: {
    sla(): Promise<unknown>;
    plan(requestId: string, systems: Array<{ system: string; operation: FulfillmentOp }>, includeHistorical?: boolean): Promise<{ requestId: string; tasks: unknown[] }>;
    status(requestId: string): Promise<unknown>;
    /** In-VPC agent: poll pending tasks. */
    pendingTasks(limit?: number): Promise<{ tasks: unknown[] }>;
    /** In-VPC agent: report an outcome. Only the outcome crosses the boundary. */
    reportTask(taskId: string, ok: boolean, error?: string): Promise<unknown>;
    /**
     * Systems you have connected that run part of a request themselves — an identity
     * platform holding your users' accounts, for instance. The in-VPC agent covers the
     * systems we cannot reach; these are the ones we can.
     */
    executors(): Promise<DsarExecutor[]>;
    /**
     * Connect one. The secret is stored encrypted and never returned; the response carries
     * the URL to point that system's webhook at.
     */
    connectExecutor(input: DsarExecutorInput): Promise<DsarExecutorCreated>;
    /**
     * Change a connection in place. Only what you send changes, and the stored credential
     * is kept unless you pass a new `secretKey` — so adding a field to a profile does not
     * cost you the connection or its id.
     */
    updateExecutor(
      id: string,
      patch: {
        profile?: unknown;
        baseUrl?: string;
        secretKey?: string;
        webhookSecret?: string | null;
        auto?: boolean;
      },
    ): Promise<DsarExecutor>;
    /** Disconnect a system; its open sub-tasks stop being driven. */
    disconnectExecutor(id: string): Promise<void>;
    /** The export bundle a connected system produced, fetched from it on demand. */
    taskExport(requestId: string, taskId: string): Promise<DsarTaskExport>;
  };
  preferences: {
    list(): Promise<PreferenceItem[]>;
    /** Save/update a subject's named-purpose opt-ins. Returns the persisted record. */
    save(subjectId: string, purposes: Record<string, boolean>): Promise<{ record: PreferenceRecord }>;
    /** One subject's record. A subject with none has empty `purposes`. */
    get(subjectId: string): Promise<PreferenceRecord>;
  };
  members: {
    list(): Promise<Member[]>;
    invite(email: string, role: string): Promise<{ member: { userId: string; email: string; role: string } }>;
    setRole(userId: string, role: string): Promise<{ member: { userId: string; email: string; role: string } }>;
    remove(userId: string): Promise<{ ok: true }>;
  };
  keys: {
    list(): Promise<ApiKeyPrefix[]>;
    /**
     * Issue a new API key; the secret is returned once. Pass `scopes` and/or `cbids` for a
     * least-privilege key — omit both for full access to the whole org.
     */
    issue(input?: ApiKeyIssueInput): Promise<ApiKeyIssued>;
    /** Revoke a key by its prefix. Immediate. */
    revoke(prefix: string): Promise<void>;
    /** Rotate a key: a new secret, returned once, with the same scopes, lock and expiry. The old one stops working. */
    roll(prefix: string): Promise<ApiKeyIssued>;
    /** Rename a key, or replace its scopes or property lock. Only the fields sent change. */
    update(prefix: string, patch: ApiKeyUpdate): Promise<{ ok: true }>;
  };
  usage(): Promise<Usage>;
  /** The key's organisation. Requires an unscoped key that is not property-locked. */
  org: {
    get(): Promise<Org>;
    /** Rename the org or set its logo. Deleting the org is not available through the API. */
    update(patch: OrgUpdate): Promise<Org>;
  };
  /** The org's audit log, newest first. API actions appear as `apikey:<prefix>`. */
  audit(limit?: number): Promise<{ entries: AuditEntry[] }>;
  assets: {
    /** Upload a banner image (≤ 1,000,000 bytes) and get its public URL. Requires sites:write. */
    upload(input: AssetUpload): Promise<{ url: string }>;
    /**
     * Delete a stored image. Takes the URL `upload` returned, or just its file name. Only
     * your own org's images are reachable — the folder comes from your API key.
     */
    delete(urlOrFileName: string): Promise<void>;
  };
  /** Provision and manage child orgs. Requires a key with the reseller:* scopes. */
  reseller: {
    list(): Promise<ResellerChildList>;
    /** Provision a child org. With `mintKey`, its first API key is returned once, as `apiKey`. */
    create(input: ResellerChildCreate): Promise<{ child: ResellerChild; apiKey?: string }>;
    get(id: string): Promise<unknown>;
    update(id: string, patch: ResellerChildPatch): Promise<unknown>;
    /**
     * Deprovision a child. Suspends it by default, which is reversible; `{ purge: true }`
     * hard-deletes it and its data, which is not.
     */
    deprovision(id: string, opts?: { purge?: boolean }): Promise<void>;
    listKeys(id: string): Promise<ApiKeyPrefix[]>;
    /** Mint an API key for a child. The secret is returned once. */
    mintKey(id: string, input?: ChildKeyInput): Promise<ApiKeyIssued>;
    revokeKey(id: string, prefix: string): Promise<void>;
  };
  webhooks: {
    list(): Promise<WebhookSubscription[]>;
    create(input: WebhookCreate): Promise<WebhookSubscription>;
    /** Change or pause a subscription. `{ active: false }` pauses without deleting it. */
    update(id: string, patch: WebhookUpdate): Promise<WebhookSubscription>;
    delete(id: string): Promise<void>;
    /** Rotate the signing secret. The new secret is returned once. */
    rollSecret(id: string): Promise<{ secret: string }>;
    /** Send a signed test event now and report what the endpoint answered. */
    test(id: string): Promise<WebhookTestResult>;
    /** Deliveries that failed every retry, newest first. */
    deadLetters(): Promise<{ deadLetters: WebhookDeadLetter[] }>;
    /** Deliver a dead letter again, to the subscription as it is now. */
    replayDeadLetter(id: string): Promise<unknown>;
  };
  /** One person's consent across every site in the org, by the subjectId your apps attach. */
  subjects: {
    /** Requires consent:read; not available to property-locked keys. */
    consent(subjectId: string): Promise<{ subjectId: string; records: unknown[]; count: number; sites: string[] }>;
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
    languages: () => get('/languages') as Promise<SupportedLanguage[]>,
    sites: {
      list: () => get('/sites') as Promise<Site[]>,
      create: (input) => request('POST', '/sites', input) as Promise<Site>,
      get: (cbid) => get(`/sites/${enc(cbid)}`) as Promise<Site>,
      delete: async (cbid) => {
        await request('DELETE', `/sites/${enc(cbid)}`);
      },
      getConfig: (cbid) => get(`/sites/${enc(cbid)}/config`) as Promise<SiteConfig>,
      putConfig: (cbid, config) => request('PUT', `/sites/${enc(cbid)}/config`, config) as Promise<SiteConfig>,
      patchConfig: (cbid, config) => request('PATCH', `/sites/${enc(cbid)}/config`, config) as Promise<SiteConfig>,
      cookies: (cbid) => get(`/sites/${enc(cbid)}/cookies`) as Promise<CookieDeclaration>,
      scan: (cbid) => request('POST', `/sites/${enc(cbid)}/scan`) as Promise<ScanStatus>,
      scanStatus: (cbid) => get(`/sites/${enc(cbid)}/scan`) as Promise<ScanStatus>,
      ab: (cbid) => get(`/sites/${enc(cbid)}/ab`) as Promise<AbResult[]>,
      policy: (cbid, o) =>
        request(
          'GET',
          `/sites/${enc(cbid)}/policy${qs({ contactEmail: o?.contactEmail, effectiveDate: o?.effectiveDate, jurisdictions: o?.jurisdictions?.join(',') })}`,
          undefined,
          true,
        ) as Promise<string>,
      setAdPersonalization: (cbid, input) => request('POST', `/sites/${enc(cbid)}/elements/ad-personalization`, input),
      analyzeSession: (cbid, input) => request('POST', `/sites/${enc(cbid)}/sentry`, input),
      banner: (cbid) => get(`/sites/${enc(cbid)}/banner`) as Promise<{ bannerId: string | null }>,
      blocked: (cbid) => get(`/sites/${enc(cbid)}/blocked`) as Promise<{ reports: BlockedReport[] }>,
      importDeclaration: (cbid, data) => request('POST', `/sites/${enc(cbid)}/import`, { data }) as Promise<ImportedDeclaration>,
      snippet: (cbid, opts) =>
        get(`/sites/${enc(cbid)}/snippet${qs({ blockingmode: opts?.blockingMode, culture: opts?.culture })}`) as Promise<InstallSnippet>,
      verify: (cbid, method) => request('POST', `/sites/${enc(cbid)}/verify`, { method }) as Promise<VerifyResult>,
      verifyChallenge: (cbid) => get(`/sites/${enc(cbid)}/verify/challenge`),
      createBulk: (sites) => request('POST', '/sites/bulk', { sites }) as Promise<{ results: BulkSiteResult[] }>,
      brand: (cbid) => request('POST', `/sites/${enc(cbid)}/brand`, {}) as Promise<BrandExtractionResult>,
      getFlow: (cbid) => get(`/sites/${enc(cbid)}/flow`) as Promise<SiteFlow>,
      editFlow: (cbid, operations) =>
        request('POST', `/sites/${enc(cbid)}/flow/ops`, { operations }) as Promise<FlowOpResponse>,
      setFlow: (cbid, config) => request('PUT', `/sites/${enc(cbid)}/flow`, config) as Promise<FlowOpResponse>,
    },
    consent: {
      verify: (cbid) => get(`/sites/${enc(cbid)}/consent/verify`) as Promise<{ valid: boolean }>,
      stats: (cbid, query) => get(`/sites/${enc(cbid)}/consent/stats${qs(toQuery(query))}`) as Promise<ConsentDay[]>,
      log: (cbid, query) => get(`/sites/${enc(cbid)}/consent/log${qs(toQuery(query))}`) as Promise<ConsentLogRow[]>,
      export: (cbid, query) => request('GET', `/sites/${enc(cbid)}/consent/export${qs(toQuery(query))}`, undefined, true) as Promise<string>,
      receipt: (cbid, stamp) => get(`/sites/${enc(cbid)}/receipt/${enc(stamp)}`) as Promise<SignedReceipt>,
      eraseSubject: (cbid, stamp) =>
        request('POST', `/sites/${enc(cbid)}/erase-consent`, { stamp }) as Promise<{ erased: number }>,
      exportSubject: (cbid, stamp) =>
        request('GET', `/sites/${enc(cbid)}/subject-export?stamp=${enc(stamp)}`) as Promise<{ cbid: string; stamp: string; records: unknown[]; count: number }>,
      ingest: async (input) => {
        // The public ingest endpoint lives under /api/v1, not the /v1 dev-API prefix,
        // so it is called directly rather than via `request` (which prepends /v1).
        const res = await doFetch(`${opts.baseUrl.replace(/\/+$/, '')}/api/v1/consent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          let message = `consent ingest failed with status ${res.status}`;
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
      },
    },
    dsar: {
      list: () => get('/dsar') as Promise<DsarRequest[]>,
      get: (id) => get(`/dsar/${enc(id)}`) as Promise<DsarRequest>,
      create: (input) => request('POST', '/dsar', input) as Promise<{ request: DsarRequest }>,
      advance: (id, toStatus) => request('POST', `/dsar/${enc(id)}/advance`, { toStatus }) as Promise<{ request: DsarRequest }>,
      response: (id) => request('GET', `/dsar/${enc(id)}/response`, undefined, true) as Promise<string>,
      erase: (id, cbid, stamp) => request('POST', `/dsar/${enc(id)}/erase`, { cbid, stamp }) as Promise<DsarEraseResult>,
      export: (id, cbid, stamp) => request('POST', `/dsar/${enc(id)}/export`, { cbid, stamp }) as Promise<DsarExportResult>,
    },
    vendors: {
      list: () => get('/vendors') as Promise<ScoredVendor[]>,
      create: (input) => request('POST', '/vendors', input) as Promise<{ vendor: VendorRecord; risk: RiskScore }>,
    },
    ropa: {
      list: () => get('/ropa') as Promise<RopaEntry[]>,
      create: (input) => request('POST', '/ropa', input) as Promise<{ entry: RopaEntry }>,
      exportCsv: () => request('GET', '/ropa/export.csv', undefined, true) as Promise<string>,
    },
    brandKits: {
      list: () => get('/brand-kits') as Promise<BrandKit[]>,
      create: (input) => request('POST', '/brand-kits', input) as Promise<{ kit: BrandKit }>,
      delete: async (id) => {
        await request('DELETE', `/brand-kits/${enc(id)}`);
      },
    },
    identity: {
      resolve: (identifiers) => request('POST', '/identity/resolve', { identifiers }) as Promise<{ subjectId: string | null }>,
      link: (identifiers) => request('POST', '/identity/link', { identifiers }) as Promise<{ subjectId: string }>,
      cluster: (subjectId) => get(`/identity/${enc(subjectId)}`) as Promise<{ subjectId: string; identifiers: Identifier[] }>,
    },
    vault: {
      record: (identifiers, decisions) => request('POST', '/vault/record', { identifiers, decisions }) as Promise<{ subjectId: string; permits: unknown[] }>,
      current: (identifiers) => request('POST', '/vault/current', { identifiers }) as Promise<{ purposes: Record<string, boolean> }>,
      permits: (identifiers) => request('POST', '/vault/permits', { identifiers }) as Promise<{ permits: unknown[] }>,
    },
    profile: {
      get: (identifiers) => request('POST', '/profile/get', { identifiers }),
      setAttributes: (identifiers, attributes) => request('POST', '/profile/attributes', { identifiers, attributes }) as Promise<{ subjectId: string }>,
      activate: (identifiers, purpose) => request('POST', '/profile/activate', { identifiers, purpose }) as Promise<{ attributes: Record<string, string> }>,
    },
    subscriptions: {
      topics: () => get('/subscriptions/topics') as Promise<{ topics: SubscriptionTopicInput[] }>,
      setTopics: (topics) => request('PUT', '/subscriptions/topics', { topics }) as Promise<{ topics: SubscriptionTopicInput[] }>,
      get: (subjectId) => get(`/subscriptions/${enc(subjectId)}`),
      set: (subjectId, topic, channel, optedIn) => request('PUT', `/subscriptions/${enc(subjectId)}`, { topic, channel, optedIn }),
      unsubscribeAll: (subjectId) => request('POST', `/subscriptions/${enc(subjectId)}/unsubscribe-all`),
      resubscribe: (subjectId) => request('POST', `/subscriptions/${enc(subjectId)}/resubscribe`),
      activation: (subjectId, topics) => request('POST', `/subscriptions/${enc(subjectId)}/activation`, { topics }) as Promise<{ entries: unknown[] }>,
    },
    assessments: {
      templates: () => get('/assessments/templates') as Promise<{ templates: unknown[] }>,
      list: () => get('/assessments') as Promise<{ assessments: unknown[] }>,
      start: (template, subject) => request('POST', '/assessments', { template, subject }),
      get: (id) => get(`/assessments/${enc(id)}`),
      answer: (id, questionId, value) => request('POST', `/assessments/${enc(id)}/answer`, { questionId, value }),
      autoPopulateFromMap: (id) => request('POST', `/assessments/${enc(id)}/autopopulate-from-map`) as Promise<{ assessment: unknown; applied: string[] }>,
      autoPopulate: (id, evidence, source) =>
        request('POST', `/assessments/${enc(id)}/autopopulate`, { evidence, ...(source !== undefined ? { source } : {}) }) as Promise<{ assessment: unknown; applied: string[] }>,
      submit: (id) => request('POST', `/assessments/${enc(id)}/submit`),
      approve: (id, by) => request('POST', `/assessments/${enc(id)}/approve`, { by }),
      reject: (id, by, reason) => request('POST', `/assessments/${enc(id)}/reject`, { by, reason }),
    },
    discovery: {
      ingestMap: (map) => request('POST', '/discovery/map', { map }) as Promise<{ scannedAt: number; systems: number }>,
      getMap: () => get('/discovery/map'),
      ropaDrafts: () => get('/discovery/ropa-drafts') as Promise<{ drafts: unknown[] }>,
      evidence: () => get('/discovery/evidence') as Promise<{ evidence: Record<string, unknown> }>,
      drift: () => get('/discovery/drift') as Promise<{ comparedTo: number | null; sinceLastScan: unknown[]; againstRecord: unknown[] }>,
      planEnforcement: (dialect, rules, opts) =>
        request('POST', '/discovery/enforcement', {
          dialect,
          rules,
          ...(opts?.permitsTable !== undefined ? { permitsTable: opts.permitsTable } : {}),
          ...(opts?.policyPrefix !== undefined ? { policyPrefix: opts.policyPrefix } : {}),
        }) as Promise<{ plan: { statements: unknown[]; revert: unknown[]; skipped: unknown[] } }>,
    },
    regulatory: {
      feed: (jurisdictions) =>
        get(`/regulatory/feed${qs({ jurisdictions: jurisdictions?.join(',') })}`) as Promise<RegulatoryFeedResult>,
      upcoming: (days) => get(`/regulatory/upcoming${qs({ days })}`) as Promise<RegulatoryFeedResult>,
    },
    ai: {
      getPolicy: () => get('/ai/policy') as Promise<{ policy: unknown; configured: boolean }>,
      setPolicy: (policy) => request('PUT', '/ai/policy', { policy }) as Promise<{ policy: unknown }>,
      inspect: (input) => request('POST', '/ai/inspect', input) as Promise<AiInspectResult>,
      inventory: () => get('/ai/inventory') as Promise<{ systems: unknown[]; shadow: unknown[] }>,
      lineage: () => get('/ai/lineage') as Promise<{ lineage: Record<string, string[]> }>,
      registerSystem: (input) => request('POST', '/ai/systems', input),
      systems: () => get('/ai/systems'),
      audit: (limit) => get(`/ai/audit${qs({ limit })}`) as Promise<{ entries: unknown[] }>,
    },
    fulfillment: {
      sla: () => get('/dsar/sla'),
      plan: (requestId, systems, includeHistorical) =>
        request('POST', `/dsar/${enc(requestId)}/plan`, { systems, ...(includeHistorical ? { includeHistorical: true } : {}) }) as Promise<{ requestId: string; tasks: unknown[] }>,
      status: (requestId) => get(`/dsar/${enc(requestId)}/fulfillment`),
      pendingTasks: (limit) => get(`/dsar/agent/tasks${qs({ limit })}`) as Promise<{ tasks: unknown[] }>,
      reportTask: (taskId, ok, error) => request('POST', `/dsar/agent/tasks/${enc(taskId)}/result`, { ok, ...(error !== undefined ? { error } : {}) }),
      executors: () => get('/dsar/executors') as Promise<DsarExecutor[]>,
      connectExecutor: (input) => request('POST', '/dsar/executors', input) as Promise<DsarExecutorCreated>,
      updateExecutor: (id, patch) => request('PATCH', `/dsar/executors/${enc(id)}`, patch) as Promise<DsarExecutor>,
      disconnectExecutor: async (id) => {
        await request('DELETE', `/dsar/executors/${enc(id)}`);
      },
      taskExport: (requestId, taskId) => get(`/dsar/${enc(requestId)}/tasks/${enc(taskId)}/export`) as Promise<DsarTaskExport>,
    },
    preferences: {
      list: () => get('/preferences') as Promise<PreferenceItem[]>,
      save: (subjectId, purposes) => request('POST', '/preferences', { subjectId, purposes }) as Promise<{ record: PreferenceRecord }>,
      get: (subjectId) => get(`/preferences/${enc(subjectId)}`) as Promise<PreferenceRecord>,
    },
    members: {
      list: () => get('/members') as Promise<Member[]>,
      invite: (email, role) =>
        request('POST', '/members', { email, role }) as Promise<{ member: { userId: string; email: string; role: string } }>,
      setRole: (userId, role) =>
        request('PATCH', `/members/${enc(userId)}`, { role }) as Promise<{ member: { userId: string; email: string; role: string } }>,
      remove: (userId) => request('DELETE', `/members/${enc(userId)}`) as Promise<{ ok: true }>,
    },
    keys: {
      list: () => get('/keys') as Promise<ApiKeyPrefix[]>,
      issue: (input) => request('POST', '/keys', input ?? {}) as Promise<ApiKeyIssued>,
      revoke: async (prefix) => {
        await request('DELETE', `/keys/${enc(prefix)}`);
      },
      roll: (prefix) => request('POST', `/keys/${enc(prefix)}/roll`) as Promise<ApiKeyIssued>,
      update: (prefix, patch) => request('PATCH', `/keys/${enc(prefix)}`, patch) as Promise<{ ok: true }>,
    },
    usage: () => get('/usage') as Promise<Usage>,
    org: {
      get: () => get('/org') as Promise<Org>,
      update: (patch) => request('PATCH', '/org', patch) as Promise<Org>,
    },
    audit: (limit) => get(`/audit${qs({ limit })}`) as Promise<{ entries: AuditEntry[] }>,
    assets: {
      upload: (input) => request('POST', '/assets', input) as Promise<{ url: string }>,
      delete: async (urlOrFileName) => {
        const name = urlOrFileName.split('/').pop() ?? urlOrFileName;
        await request('DELETE', `/assets/${enc(name)}`);
      },
    },
    reseller: {
      list: () => get('/reseller/customers') as Promise<ResellerChildList>,
      create: (input) => request('POST', '/reseller/customers', input) as Promise<{ child: ResellerChild; apiKey?: string }>,
      get: (id) => get(`/reseller/customers/${enc(id)}`),
      update: (id, patch) => request('PATCH', `/reseller/customers/${enc(id)}`, patch),
      deprovision: async (id, o) => {
        await request('DELETE', `/reseller/customers/${enc(id)}${qs({ purge: o?.purge ? 'true' : undefined })}`);
      },
      listKeys: (id) => get(`/reseller/customers/${enc(id)}/keys`) as Promise<ApiKeyPrefix[]>,
      mintKey: (id, input) => request('POST', `/reseller/customers/${enc(id)}/keys`, input ?? {}) as Promise<ApiKeyIssued>,
      revokeKey: async (id, prefix) => {
        await request('DELETE', `/reseller/customers/${enc(id)}/keys/${enc(prefix)}`);
      },
    },
    webhooks: {
      list: () => get('/webhooks') as Promise<WebhookSubscription[]>,
      create: (input) => request('POST', '/webhooks', input) as Promise<WebhookSubscription>,
      update: (id, patch) => request('PATCH', `/webhooks/${enc(id)}`, patch) as Promise<WebhookSubscription>,
      delete: async (id) => {
        await request('DELETE', `/webhooks/${enc(id)}`);
      },
      rollSecret: (id) => request('POST', `/webhooks/${enc(id)}/roll`) as Promise<{ secret: string }>,
      test: (id) => request('POST', `/webhooks/${enc(id)}/test`) as Promise<WebhookTestResult>,
      deadLetters: () => get('/webhooks/dead-letters') as Promise<{ deadLetters: WebhookDeadLetter[] }>,
      replayDeadLetter: (id) => request('POST', `/webhooks/dead-letters/${enc(id)}/replay`),
    },
    subjects: {
      consent: (subjectId) =>
        get(`/subjects/${enc(subjectId)}/consent`) as Promise<{ subjectId: string; records: unknown[]; count: number; sites: string[] }>,
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
