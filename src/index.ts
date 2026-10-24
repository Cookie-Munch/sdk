/**
 * @cookiemunch/sdk — a small, typed REST client for the Cookie Munch Developer API
 * (the /v1 surface). Construct it with an API key; the org is derived server-side
 * from the key, so callers never pass an orgId. `fetch` is injectable for testing
 * and non-browser/non-Node runtimes; it defaults to the global fetch.
 *
 *   const fc = createCookieMunch({ apiKey: 'fck_…', baseUrl: 'https://api.cookiemunch.net' });
 *   const sites = await fc.sites.list();
 */

export * from './types.js';
export * from './consent.js';
export * from './webhooks.js';
export * from './consent-sync.js';
export * from './executor-conformance.js';
export type * from './fd-consent.js';
import type {
  CategoryRegistry,
  Identity,
  AccountOrgs,
  Site,
  SiteCreate,
  SiteConfig,
  SiteUpdate,
  SiteUpdateResult,
  IntegrationHealthReport,
  HealthWaiver,
  HealthWaiverInput,
  ProvisionRequest,
  ProvisionResult,
  PartnerLink,
  PartnerLinkCreate,
  PartnerCatalogEntry,
  ConsentDay,
  ConsentLogRow,
  RangeQuery,
  LogQuery,
  DsarRequest,
  DsarCreate,
  DsarCase,
  DsarCaseCreate,
  DsarCaseReceipt,
  DsarSettings,
  SubjectCard,
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
import type { ConformanceReport } from './executor-conformance.js';

/**
 * This package's version, sent in the default User-Agent. Cloudflare answers a request with
 * no recognisable User-Agent with `403 error code: 1010`; a test pins this to package.json.
 */
export const SDK_VERSION = '0.6.0';

export interface CookieMunchOptions {
  apiKey: string;
  /** "https://api.cookiemunch.net" — the /v1 prefix is appended automatically. */
  baseUrl: string;
  /** Injectable for tests / custom runtimes. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /**
   * Send `Prefer: strict-unknown-fields` on every write: a body field the operation does not
   * declare is refused (`400 unknown_field`, with `field`) instead of ignored. Catches typos.
   */
  strictUnknownFields?: boolean;
  /** The `User-Agent` sent on every request. Default `cookiemunch-js/<version>`. */
  userAgent?: string;
  /**
   * Seal every once-shown secret to this X25519 public key (`x25519:<base64>`): answers carry `sealed_secret`
   * (a libsodium sealed box) and `sealed_field` instead of the plaintext. Sent as `X-Secret-Recipient` on writes.
   */
  secretRecipient?: string;
  /**
   * Extra headers on every request, e.g. `{ 'Idempotency-Key': '<forgedeck ref>:<run>' }` on a client made for
   * one create: a retry with the same key replays the first answer (secrets included) for 24 hours.
   */
  headers?: Record<string, string>;
}

/** Tags on a created resource (CMU-X29). `forgedeck_sandbox: true` can only be set at creation. */
export type ResourceMetadata = Record<string, string | number | boolean>;
/** Keep only resources whose tags match, e.g. `{ forgedeck_product: 'referalli' }`. */
export interface MetadataFilter { metadata?: Record<string, string> }
/** externalRef and metadata, accepted by every create (orgs, sites, webhooks, executors, DSARs, partner links). */
export interface ResourceTagsInput {
  /** Your own name for it, unique per org and type: a repeat create with the same body returns the existing one. */
  externalRef?: string;
  metadata?: ResourceMetadata;
}
export type TaggedType = 'org' | 'site' | 'webhook' | 'executor' | 'dsar' | 'partner_link';
export interface ResourceTags { type: TaggedType; id: string; metadata: ResourceMetadata; externalRef: string | null; sandbox: boolean }
export interface ResourceTagsUpdate { dryRun?: true; type: TaggedType; id: string; metadata: ResourceMetadata; diff: Array<{ field: string; before: unknown; after: unknown }> }
/** What a sandbox hard delete removed. */
export interface SandboxPurge { deleted: true; cbid?: string; orgId?: string; counts: Record<string, number> }
/** A partner link in the suite-standard shape (CMU-X34). */
export interface StandardPartnerLink {
  id: string;
  partner: string;
  resource: string;
  scopes: string[];
  created_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  calls_30d: number;
  status: 'active' | 'waiting_on_partner' | 'revoked' | 'expired';
  externalId?: string;
  label?: string;
}
export interface StandardPartnerLinkCreate extends ResourceTagsInput {
  partner: string;
  /** `site:<cbid>` or `org:<org id>`. */
  resource: string;
  scopes: Array<'consent:read' | 'receipt:read' | 'dsar:read' | 'dsar:write' | 'dsar:rights-links' | 'sites:read'>;
  expires_at?: string;
  externalId?: string;
  label?: string;
}
/** POST /v1/provision v2: the `cookiemunch` block of a forgedeck.yaml (see the forgedeck API map page). */
export interface ProvisionRequestV2 {
  forgedeck: { ref?: string; product: string; env?: string; sandbox?: boolean };
  site: { domain: string; name?: string; aliases?: string[]; locales?: string[]; preset?: string; devOrigins?: string[] };
  cbid?: string;
  categories?: string[];
  rightsIdentity?: Record<string, unknown>;
  dsar?: { graceDays?: number };
  atlas?: { instanceId?: string; secretKey?: string; cookieConsent?: boolean; executor?: boolean; frontendApiHost?: string };
  forumulate?: { org?: string; orgId?: string; token?: string; consent?: boolean; executor?: boolean; label?: string };
  chatly?: { workspace?: string; publicId?: string; vendorHook?: boolean; executor?: boolean };
  self?: { baseUrl: string; contract?: string; secret: string };
  referalli?: { orgId?: string; trackingToken?: string; preset?: boolean; partner?: boolean; executor?: string | boolean };
  embedManifests?: string | string[];
  brand?: { url?: string };
}
/** GET /v1/provision/env: names, non-secret values, and references for secrets. */
export interface ProvisionEnv { ref: string; cbid: string; env: Array<{ name: string; value?: string; secretRef?: string }> }
/** A vended short-lived key, shown once. */
export interface ApiKeyVended { key: string; prefix: string; expiresAt: number; scopes: string[]; cbids: string[] | null }
/** The suite-standard key listing (GET /v1/keys?shape=standard). */
export interface StandardKeyList {
  keys: Array<{
    id: string; prefix: string; name: string | null; owner: string | null; kind: string | null; env: string | null; format: string | null;
    scopes: string[] | null; resources: string[] | null; created_at: string | null; expires_at: string | null;
    last_used_at: string | null; last_used_ip: string | null; status: 'active' | 'expired';
  }>;
}
/** A leaked secret to revoke (POST /v1/keys/revoke_leaked, no authentication needed). */
export type LeakReport = { key: string; source?: string } | { keys: string[]; source?: string };

/**
 * Thrown for any non-2xx response. `message` is the server's `error` field when present;
 * `code` is populated from the server's `code` field whenever the error body carries one
 * (e.g. `forbidden` on a scope failure, whose `message` is `insufficient_scope`,
 * or `banner_in_use` on a banner-library conflict). It's `undefined` when the body has no `code`.
 */
export class CookieMunchApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** The parsed JSON error body, when there was one (e.g. `issues` on a 422). */
  readonly body?: unknown;
  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = 'CookieMunchApiError';
    this.status = status;
    if (code !== undefined) this.code = code;
    if (body !== undefined) this.body = body;
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
  /**
   * The purpose by language (lowercase BCP-47 tag). On a declared row, the owner's; on a
   * row the cookie database classified, the database's (empty: none yet).
   */
  purposes?: Record<string, string>;
  expiry?: string;
  /** Page URLs (multi-page scan) that set this cookie, earliest first. */
  foundOnPages?: string[];
  /** The site owner declared this cookie; it overrides the scan. */
  declared?: boolean;
  /** A declared `prefix*` wildcard row that no observed cookie matched yet. */
  pattern?: boolean;
  /**
   * Why a person should look at it. Visitors see unclassified and category ones under
   * "Unclassified"; `retired_but_seen` = retired, but a crawl or a visit saw it since, so the
   * site still sets it and it is listed again. `awaiting_corroboration` / `suspicious_report` =
   * only visitors reported it (not enough of them yet, or in one injection-shaped report), owner
   * views only; `foreign_cmp` = another consent platform's cookie, filed unclassified;
   * `not_seen_recently` = unseen for the site's `staleAfterDays`, owner views only.
   */
  review?: 'unclassified' | 'category_disabled' | 'category_unknown' | 'retired_but_seen' | 'awaiting_corroboration' | 'suspicious_report' | 'foreign_cmp' | 'not_seen_recently';
  /** Epoch-ms a crawl or a real visit last saw it. Absent on older rows. */
  lastSeenAt?: number;
  /** Owner views only: the site owner retired this cookie (see `sites.retireCookie`). */
  retired?: { at: number; renamedTo?: string; note?: string; by?: string; pattern?: string };
  /** A cookie (default, also when absent) or a key in browser storage. */
  type?: StorageType;
  /** Where the row came from: a real visit, a crawl, the owner (`api`) or a vendor preset (`import`). */
  source?: 'embed' | 'scan' | 'api' | 'import';
  /** Epoch-ms it was first stored. Absent on rows from before provenance was recorded. */
  firstSeen?: number;
  /** Distinct visits that reported it. */
  visits?: number;
  /** Owner views only: reported by a real visit, but not yet by enough distinct visits to be listed publicly. */
  quarantined?: boolean;
  /** "Declared by <vendor>": the vendor preset that declared it. */
  vendor?: string;
}

/** What a declaration row describes. */
export type StorageType = 'cookie' | 'localStorage' | 'sessionStorage' | 'indexedDB';

/** A cookie the site owner retired: the site renamed or stopped setting it. */
export interface RetiredCookie {
  /** Exact name, or a `prefix*` wildcard. */
  name: string;
  /** Epoch-ms it was retired; anything seen after this brings it back. */
  at: number;
  renamedTo?: string;
  note?: string;
  /** `apikey:<prefix>` or a dashboard user id. */
  by?: string;
  pattern?: boolean;
}

/** A site's cookie declaration: the latest scan and observed visits with the site's own
 *  declarations on top. This is what GET /v1/sites/:cbid/cookies returns. */
export interface CookieDeclaration {
  /** Epoch-ms of the latest scan or declaration change, or 0 if none. */
  updatedAt: number;
  cookies: CategorizedCookie[];
  /** The site owner's declarations, as stored. */
  declared?: DeclaredCookie[];
  /** The site's retirements, as stored (owner views only). */
  retired?: RetiredCookie[];
}

/** What the site owner says a cookie is (PUT /v1/sites/:cbid/cookies/:name). */
export interface DeclaredCookieInput {
  /** A standard category or one of the site's `categories.custom` ids. Not `unclassified`. */
  category: string;
  /** Shown to visitors, and the fallback for any language `purposes` lacks. */
  purpose: string;
  /**
   * The purpose in other languages: `{ es: '…', 'pt-BR': '…' }` (BCP-47 language or
   * language-region tags, stored lowercased; ≤50 languages, ≤1000 characters each).
   * The banner, `data-cc="declaration"` and /cookie-declaration.js draw the visitor's.
   */
  purposes?: Record<string, string> | null;
  provider?: string;
  expiry?: string;
  domain?: string;
  /** Treat the name as a prefix wildcard (a trailing `*` does the same). */
  pattern?: boolean;
  /** A cookie (default) or a key in localStorage, sessionStorage or IndexedDB. */
  type?: StorageType;
}

/** A stored declaration. */
export interface DeclaredCookie extends DeclaredCookieInput {
  name: string;
  updatedAt: number;
  /** `import` when a vendor preset wrote it. */
  source?: 'import';
  /** The vendor whose preset declared it. */
  vendor?: string;
}

/** A platform whose cookies and storage a preset declares. */
export type CookiePresetVendor = 'atlas' | 'forumulate' | 'chatly' | 'cookiemunch' | 'referalli' | 'firstpromoter' | 'partnerstack' | 'tapfiliate' | 'impact'
  /** @deprecated the old name of `referalli`, accepted until 2027-10-23. */
  | 'referally';

/** Where a vendor's live manifest will come from, and whether it exists yet. */
export interface CookiePresetManifest {
  /** `live`/`stale`/`invalid`: the vendor's embed manifest feeds the preset; `waiting_on_vendor`: built-in rows. */
  status: 'builtin' | 'live' | 'stale' | 'invalid' | 'waiting_on_vendor';
  waitingOn?: string;
  item?: string;
  contract?: string;
  /** Where the manifest is read from, or `upload`. */
  source?: string;
  /** The `updated` of the copy in effect. */
  updated?: string;
  fetchedAt?: number;
  /** Why the latest read was not accepted, by rule (1–6). */
  errors?: Array<{ rule?: number; path?: string; code?: string; message: string }>;
  warnings?: Array<{ rule?: number; path?: string; code?: string; message: string }>;
}

/** PUT /v1/sites/:cbid/cookies/presets/custom — any vendor's embed manifest, by URL or as a body. */
export type CustomPresetInput = ({ url: string; manifest?: never } | { manifest: EmbedManifest; url?: never }) & {
  /** Values for the manifest's `{placeholders}`. */
  params?: Record<string, string>;
};

/** One suggestion in GET /v1/sites/:cbid/cookies/suggestions. */
export interface CookieSuggestion {
  name: string;
  storage: 'cookie' | 'localStorage' | 'sessionStorage' | 'indexedDB';
  foundOnPages: string[];
  /** `denied`: a crawl saw it before any consent; `granted`: after accepting all. */
  consentStates?: Array<'denied' | 'granted'>;
  suggestedPreset?: string;
  suggestedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  purpose?: string;
  reason: string;
}

/** GET /v1/sites/:cbid/cookies/suggestions */
export interface CookieSuggestions {
  suggestions: CookieSuggestion[];
  vendors: Array<{
    vendor: string;
    display: string;
    preset: string | null;
    applied: boolean;
    needsParams: boolean;
    evidence: Array<{ kind: 'script' | 'storage' | 'manifest'; value: string; pages?: string[] }>;
  }>;
}

/** POST /v1/sites/:cbid/cookies/suggestions/declare */
export interface CookieSuggestionsDeclared {
  presetsApplied: string[];
  declaredCount: number;
  skipped?: Array<{ name: string; reason: string }>;
  dryRun?: true;
  declared?: DeclaredCookie[];
  diff?: DeclarationDiff;
}

/** Preset parameters: Atlas `frontendApiHost`/`crossSubdomainCookies`; Chatly `publicId`/`dragging`/`category`; referral and affiliate presets (referalli, firstpromoter, partnerstack, tapfiliate, impact) `cookieDomain`/`cookieDays`/`category`, referalli `legacyName`, impact `campaignId`. */
export interface CookiePresetParams {
  frontendApiHost?: string;
  crossSubdomainCookies?: boolean;
  publicId?: string;
  dragging?: boolean;
  category?: string;
  cookieDomain?: string;
  cookieDays?: number;
  /** referalli: default true, also declare referally_ctx (the pre-rename copy aff.js still writes). */
  legacyName?: boolean;
  /** impact: your program id; declares IR_<campaignId> too. */
  campaignId?: string;
}

/** One browser key a surface writes, in an embed manifest. */
export interface EmbedManifestStorage {
  name: string;
  type: 'cookie' | 'localStorage' | 'sessionStorage' | 'indexedDB';
  category: string;
  /** `session`, `persistent` or a duration such as `365d`. */
  lifetime?: string;
  /** By language; `en` is always there. */
  purpose: Record<string, string>;
  domain?: string;
  sentTo?: string;
}

/** One embeddable surface in an embed manifest: its origins by CSP directive and its storage. */
export interface EmbedManifestSurface {
  /** Origins by CSP directive (`script-src`, `connect-src`, …). */
  csp?: Record<string, string[]>;
  /** Non-origin sources the surface needs (`'unsafe-inline'`, `data:`). */
  requires?: Record<string, string[]>;
  trustedTypes?: string[];
  consentCategory?: string;
  storage?: EmbedManifestStorage[];
  sri?: Record<string, string>;
}

/** The shared embed/origins manifest (https://cookiemunch.net/schemas/embed-v1.json). */
export interface EmbedManifest {
  schema: string;
  product: string;
  updated: string;
  openapi?: string;
  llms?: string;
  status?: string;
  changelog?: string;
  docs?: string;
  checkers?: { userAgent?: string; egress?: string[]; agents?: Array<{ role: string; userAgent?: string; userAgentContains?: string; description?: string }> };
  surfaces: Record<string, EmbedManifestSurface>;
  changes?: Array<{ effective: string; surface: string; add?: Record<string, string[]>; remove?: Record<string, string[]>; note?: string }>;
  /** The tenant variant only: the site and its hosts. */
  tenant?: { cbid: string; siteHosts: string[]; rightsPage: string; preferenceCentre: string };
}

/** One preset in GET /v1/sites/:cbid/cookies/presets. */
export interface CookiePreset {
  /** A first-class preset, or a custom preset's product id. */
  vendor: CookiePresetVendor | (string & {});
  /** A custom preset (importCookieManifest). */
  custom?: boolean;
  url?: string;
  params: Array<{ name: string; type: string; required: boolean; description?: string }>;
  applied: boolean;
  declared: string[];
  manifest: CookiePresetManifest;
}

/** What applying a preset declared. */
export interface CookiePresetResult {
  vendor: CookiePresetVendor | (string & {});
  /** `manifest` when the rows came from the vendor's embed manifest. */
  source?: 'manifest';
  cookies: DeclaredCookie[];
  removed: string[];
  skipped?: Array<{ name: string; reason: string }>;
  note?: string;
  /** Rows filed under a category this site has switched off (`cookies[<name>].category`). */
  warnings?: Array<{ field: string; reason: string }>;
  /** With `warnings`: a body for `sites.patchConfig` that fixes them; apply the preset again after. */
  suggestedConfigPatch?: Record<string, unknown>;
  /** True when called with the deprecated name `referally`. */
  deprecated?: true;
  deprecatedAlias?: string;
  manifest: CookiePresetManifest;
  dryRun?: true;
  declared?: DeclaredCookie[];
  diff?: DeclarationDiff;
}

/** What removing observed rows removed (or, with `dryRun`, would). */
export interface ObservedPurgeResult {
  removed: string[];
  count: number;
  since?: number;
  until?: number;
  dryRun?: true;
}

/** What a declaration write would change (`dryRun`). */
export interface DeclarationDiff {
  added: DeclaredCookie[];
  removed: DeclaredCookie[];
  changed: Array<{ name: string; before: DeclaredCookie; after: DeclaredCookie }>;
}

/** The answer to a `dryRun` declaration write: nothing was stored. */
export interface DeclarationDryRun {
  dryRun: true;
  /** Every declaration the site would have. */
  declared: DeclaredCookie[];
  diff: DeclarationDiff;
}

/** A warning about a write: e.g. the category is switched off for the site. */
export interface DeclarationWarning {
  field: string;
  reason: string;
}

/** What an import with `apply` declared, on top of what it read. */
export interface AppliedImport extends ImportedDeclaration {
  applied: number;
  skipped: Array<{ name: string; reason: string }>;
  warnings?: DeclarationWarning[];
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
  /** `scanning` while the last scan is queued or crawling. Kept for older clients; read `state`. */
  status: 'idle' | 'scanning';
  /** Epoch-ms of the last completed scan, or null. */
  lastScannedAt: number | null;
  /** What the last scan saw of the live banner's Accept all / Reject all. Absent until measured. */
  buttonParity?: ButtonParityScan;
  /** Where the last scan is: `idle` when the site was never scanned (older servers left it out). */
  state?: 'idle' | 'queued' | 'scanning' | 'done' | 'failed';
  scanId?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  /** Cookies this crawl saw (the stored list also keeps earlier finds: `keptFromEarlier`). */
  cookieCount?: number;
  keptFromEarlier?: number;
  pagesVisited?: number;
  /** Where the site's address redirected to (its canonical host), when it did. */
  finalUrl?: string;
  /** Why it failed. */
  error?: string;
}

/** Consent-button parity of the banner a real browser saw on the site (see ScanStatus). */
export interface ButtonParityScan {
  url: string;
  /** False when no visible consent accept control was found in a recognisable banner. */
  bannerFound: boolean;
  /**
   * True when the checks ran: our embed, or a recognised banner with both Accept and Reject.
   * False = not measured — no findings, `score` null. Absent on scans stored before it existed.
   */
  measured?: boolean;
  /** `cookiemunch` = our embed; `other` = found by its button text. */
  cmp: 'cookiemunch' | 'other' | null;
  acceptFound: boolean;
  rejectFound: boolean;
  designWarnings: ButtonParityFinding[];
  /** 0–100; null when no banner was found. */
  score: number | null;
  checkedAt?: number;
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
  /** The blocking mode on the tag — the site's `blocking.mode` unless overridden. */
  blockingMode: string;
  /** Where `blockingMode` came from: the site's config, or the `blockingMode` option. */
  blockingModeSource?: 'config' | 'query';
  /** The tag's data-culture, when it has one. */
  culture?: string;
  /** CSP sources this site needs, by directive, plus a paste-able `policy`. */
  csp?: CspSources;
  /** Present when an override disagrees with the stored config. */
  warnings?: ConfigWarning[];
}

/** Content Security Policy sources the embed needs. */
export interface CspSources {
  script: string[];
  connect: string[];
  img: string[];
  /** Always includes 'unsafe-inline' (the banner's shadow-root <style>), unless you use a nonce. */
  style: string[];
  font: string[];
  frame: string[];
  /** The same as one policy fragment. */
  policy: string;
}

/** Something a config write did not store as sent. */
export interface ConfigWarning {
  field: string;
  reason: string;
}

/** One leaf a config write would change. */
export interface ConfigChange {
  path: string;
  from?: unknown;
  to?: unknown;
}

/** `PUT …/config` options. `keep: 'unspecified'` keeps the stored value of every top-level field the body omits. */
export interface PutConfigOptions {
  keep?: 'unspecified';
}

/** What a config write would do (`?dryRun=1`) — nothing is saved. */
export interface ConfigDryRun {
  dryRun: true;
  /** The config as it would be saved. */
  config: SiteConfig;
  /** Every leaf that would change. */
  diff: ConfigChange[];
  warnings?: ConfigWarning[];
  /** Consent-button parity of the would-be config (see {@link ButtonParityFinding}). */
  designWarnings: ButtonParityFinding[];
}

/** The effective style of an Accept all / Reject all control. */
export interface ParityControlSummary {
  id?: string;
  label: string;
  element: 'button' | 'link';
  background?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  fontWeight?: number;
  width?: number;
  height?: number;
}

/**
 * One way Accept all is pushed harder than Reject all (colour, size, placement, copy, custom
 * CSS). Returned as `designWarnings` on every config read and write, and by `lintConfig`.
 * A warning, never an error — the config is saved regardless. See /docs/fair-consent-buttons.
 */
export interface ButtonParityFinding {
  code:
    | 'reject_missing_first_layer' | 'reject_missing_same_layer' | 'reject_hidden' | 'reject_below_fold' | 'reject_isolated'
    | 'reject_low_emphasis' | 'saturation_gap' | 'color_mismatch' | 'reject_text_low_contrast' | 'reject_styled_as_link'
    | 'font_size_gap' | 'font_weight_gap' | 'size_gap' | 'padding_gap' | 'border_mismatch' | 'reject_label_missing'
    | 'reject_label_long' | 'confirmshaming' | 'custom_css_asymmetric'
    // WCAG contrast findings (each carries `wcag`).
    | 'text_low_contrast' | 'link_low_contrast' | 'button_text_low_contrast' | 'focus_ring_low_contrast'
    | 'toggle_low_contrast' | 'control_boundary_low_contrast';
  severity: 'warning' | 'notice';
  layer: 'banner' | 'preferences' | 'modal' | 'popup' | 'bar' | 'inline' | 'custom';
  accept: ParityControlSummary | null;
  reject: ParityControlSummary | null;
  metric: { name: string; accept?: number; reject?: number; value: number; threshold: number };
  detail: string;
  fix: string;
  where: { view?: string; variant?: string; theme?: 'light' | 'dark'; breakpoint?: 'desktop' | 'mobile'; language?: string; url?: string };
  /** On a contrast finding: the WCAG success criterion (1.4.3 text, 1.4.11 non-text). */
  wcag?: '1.4.3' | '1.4.11';
}

/** Reject all style values that would match the Accept all on the same layer. */
export interface SuggestedRejectStyle {
  layer: string;
  view?: string;
  background?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  fontWeight?: number;
  width?: number;
  height?: number;
}

/** `POST /v1/sites/:cbid/config/lint` — nothing is saved. */
export interface ButtonParityLint {
  /** `merged` = what PATCH would store (merged over the stored config); `replaced` = what PUT would store (`replace: true`). */
  mode: 'merged' | 'replaced';
  designWarnings: ButtonParityFinding[];
  /** 100 minus 20 per warning and 5 per notice, floored at 0. */
  score: number;
  suggestedReject: SuggestedRejectStyle[];
}

/**
 * Scrollbars on the surfaces Cookie Munch renders — the same shape on the banner theme (`theme.scrollbar`)
 * and the rights-page theme. Colours are #hex, rgb() or hsl(); width is clamped to 4–16, radius to 0–999.
 */
export interface ScrollbarTheme {
  style: 'themed' | 'thin' | 'native' | 'hidden';
  thumb?: string;
  thumbHover?: string;
  track?: string;
  width?: number;
  radius?: number;
}

/** The hosted rights page document. See docs/rights-page for each section type's props. */
export interface RightsPageDocument {
  v: 1;
  theme: { preset: 'brand' | 'light' | 'dark' | 'custom'; width: 'narrow' | 'normal' | 'wide' | 'full'; density: 'compact' | 'comfortable' | 'spacious'; colorScheme: 'light' | 'dark' | 'auto'; scrollbar?: ScrollbarTheme; [k: string]: unknown };
  sections: Array<{ id: string; type: string; props: Record<string, unknown>; hidden?: { phone?: boolean; desktop?: boolean }; style?: Record<string, unknown> }>;
  form: { requestTypes: Array<Record<string, unknown>>; fields: Array<Record<string, unknown>>; jurisdiction: 'auto' | 'ask' | 'hidden'; consentIdField: 'hidden' | 'optional' | 'required'; success: { title?: string; body?: string }; submitLabel?: string };
  i18n: { defaultLocale: string; autoDetect: boolean; overrides: Record<string, unknown> };
  seo: { title?: string; description?: string; favicon?: string; image?: string; index: boolean };
  customCss?: string;
}
/** `message` is English; `code` (+ `params`) is stable, for your own wording or language. */
export interface RightsPageIssue { path: string; message: string; code?: string; params?: Record<string, string | number> }
export interface RightsPageDraft { cbid: string; draft: RightsPageDocument; version: number; publishedAt: number | null; updatedAt: number | null; warnings: RightsPageIssue[] }
export interface RightsPageDryRun { dryRun: true; cbid: string; draft: RightsPageDocument; warnings: RightsPageIssue[] }
/** Who published a version: `publishedBy` is an actor id; `publishedByEmail` names a dashboard user (null for an API key). */
export interface RightsPagePublisher { publishedBy: string; publishedByEmail: string | null; publishedVia: 'dashboard' | 'api_key' }
export interface RightsPagePublished { cbid: string; page: RightsPageDocument; version: number; publishedAt: number; publishedBy?: string | null; publishedByEmail?: string | null; publishedVia?: 'dashboard' | 'api_key' | null }
/**
 * Optimistic concurrency for a draft write: the draft's `updatedAt` as you last read it (epoch ms or
 * an ISO date; null = you saw no saved draft). A mismatch rejects with a 409 CookieMunchApiError whose
 * body is RightsPageDraftConflict. Omitted: a full write (put) is last-write-wins; a patch merges onto the draft
 * as it is when written, so a concurrent edit is not lost.
 */
export interface RightsPageWriteOptions { baseUpdatedAt?: number | string | null }
export interface RightsPageDraftConflict { error: 'draft_conflict'; draft: RightsPageDraft }
/** `draftUpdatedAt`: the draft's updatedAt after the call — pass it as the next `baseUpdatedAt`. */
export interface RightsPagePublishResult { cbid: string; version: number; publishedAt: number; draftUpdatedAt: number; rolledBackTo?: number }
export interface RightsPageVersions { cbid: string; versions: Array<{ version: number; publishedAt: number } & RightsPagePublisher> }

/** The draft body with `baseUpdatedAt` added when the caller passed one (null included). */
const withBase = (doc: object, opts?: RightsPageWriteOptions): object =>
  opts?.baseUpdatedAt !== undefined ? { ...doc, baseUpdatedAt: opts.baseUpdatedAt } : doc;

/** Options for POST /v1/sites/:cbid/preview-token. All optional. */
export interface PreviewTokenOptions {
  /** Lifetime in seconds, 1..3600. Default 900. */
  ttlSeconds?: number;
  /** The page to preview. Default: the site's registered domain. */
  url?: string;
  /** Region to force: a country or subdivision code (`de`, `us-ca`) or `eu`. */
  region?: string;
  /** Language to force, as a BCP 47 tag (`de`, `pt-BR`). */
  lang?: string;
}

/** A banner preview token, and the page URL that opens the preview. */
export interface PreviewToken {
  cbid: string;
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  region?: string;
  lang?: string;
  /** The page with `cm_preview` / `cm_region` / `cm_lang` added. */
  previewUrl?: string;
}

/** A right a rights link may file (the hosted rights page's request-type kinds). */
export type RightKind =
  | 'access' | 'erasure' | 'rectification' | 'portability' | 'restriction'
  | 'objection' | 'opt_out_sale' | 'opt_out_targeted' | 'limit_sensitive';

/** Input for POST /v1/sites/:cbid/rights-links. */
export interface RightsLinkInput {
  /** The signed-in person. `email` must be an address you have verified. */
  subject: { email: string; userId?: string };
  /** Limit the link to these rights. Default: every right the page offers. */
  rights?: RightKind[];
  /** Lifetime in seconds, 60..3600. Default 900. */
  ttlSeconds?: number;
}

/** A signed, single-use link to the hosted rights page for one signed-in person. */
export interface RightsLink {
  /** `https://<customDomain>/?t=…`, or `https://cookiemunch.net/r/<cbid>?t=…` when `customDomain` is null. */
  url: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  /** The site's active custom rights-page host the link opens on, or null. */
  customDomain: string | null;
}

/** One DNS record to create, exactly as written. */
export interface DnsRecordInstruction {
  type: 'CNAME' | 'TXT';
  name: string;
  value: string;
}

/** A custom hostname serving a site's rights page. */
export interface RightsPageDomain {
  /** Lowercase ASCII form (punycode for an internationalised name). */
  hostname: string;
  /** As a person reads it. */
  unicodeHostname: string;
  cbid: string;
  /** pending_dns → verifying → issuing → active, or error (see lastError). */
  status: 'pending_dns' | 'verifying' | 'issuing' | 'active' | 'error';
  certStatus: 'none' | 'pending' | 'issued' | 'failed';
  createdAt: number;
  verifiedAt?: number;
  activatedAt?: number;
  lastCheckedAt?: number;
  /** dns_not_found | wrong_target | hostname_in_use | router_write_failed | certificate_not_issued | dns_changed | probe_failed */
  lastError?: string;
  url: string;
  /** The records to create: the CNAME, or (apex / flattened / proxied) the TXT plus an ALIAS to the same target. */
  /** `cname.value` is this domain's own `<token>.cname.cookiemunch.net` — unique to the claim; a CNAME to anything else does not verify it. */
  dns: { recommended: 'cname' | 'flattened'; cname: DnsRecordInstruction; txt: DnsRecordInstruction };
  /** Only on a verify that found no proof: what DNS answered. */
  dnsSeen?: { cnames: string[]; addresses: string[]; txt: string[] };
}

/** The site's custom hostnames, the plan allowance (null = unlimited) and the org's usage. */
export interface RightsPageDomainList {
  domains: RightsPageDomain[];
  limit: number | null;
  used: number;
  target: string;
}

/** Options for the snippet endpoint. */
export interface SnippetOptions {
  /** Override the site's configured `blocking.mode`. Default: the config's. */
  blockingMode?: 'auto' | 'manual';
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

/** PUT /v1/sites/{cbid}/brand: `{url}` alone (fetched once, https only), or a DTCG brand.json document. */
export type BrandImportInput = { url: string } | Record<string, unknown>;

/** One brand.json role and what it became. */
export interface BrandMappingRow {
  role: string;
  /** The site-config path it sets, e.g. `banner.theme.highlight`. */
  target: string;
  value: string | number;
  /** The rights-page theme token the same value feeds. */
  rightsPage?: string;
  /** `site` when the site's own banner theme value wins over brand.json. */
  source: 'brand.json' | 'site';
  inForce?: string | number;
  /** Variants that override it for some visitors. */
  variants?: string[];
}

/** The read-back of a brand.json import. Precedence: brand.json < site banner theme < per-banner variant. */
export interface BrandReadBack {
  cbid: string;
  dryRun?: boolean;
  source: { type: 'url'; url: string } | { type: 'body' };
  importedAt: number;
  precedence: string;
  mapping: BrandMappingRow[];
  ignored: Array<{ role: string; reason: string }>;
  warnings: Array<{ role: string; code: 'third_party_font_host'; message: string }>;
  configWarnings?: Array<{ field: string; reason: string }>;
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
  | { ok: true; flow: Record<string, unknown>; /** Consent-button parity of the saved design. */ designWarnings?: ButtonParityFinding[] }
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
  /** Epoch ms the key stops working; null = never. */
  expiresAt?: number | null;
  name?: string | null;
  /** null = full access. */
  scopes?: string[] | null;
  cbids?: string[] | null;
  /** Epoch ms it last authenticated a request (recorded at most hourly); null = not since recording began. */
  lastUsedAt?: number | null;
  /** The address of that request. */
  lastUsedIp?: string | null;
  /** `user:<id>`, `service:<name>` or `apikey:<prefix>`. */
  owner?: string | null;
  kind?: 'org' | 'site' | null;
  env?: 'live' | 'test' | null;
  format?: 'cookiemunch' | 'legacy';
  strictUnknownFields?: boolean;
}

/** A revoked key in the report: when, by whom, why; never the secret. */
export interface ApiKeyRevoked {
  prefix: string;
  name: string | null;
  owner: string | null;
  scopes: string[] | null;
  cbids: string[] | null;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  lastUsedIp: string | null;
  revokedAt: number;
  revokedBy: string;
  reason: 'revoked' | 'rolled' | 'leaked';
  leakSource: string | null;
}

/** GET /v1/keys/report — key hygiene. */
export interface ApiKeyReport {
  generatedAt: number;
  unusedDays: number;
  expiringDays: number;
  unused: Array<ApiKeyPrefix & { reason: string }>;
  broad: Array<ApiKeyPrefix & { reason: string }>;
  expiringSoon: Array<ApiKeyPrefix & { reason: string }>;
  noExpiry: number;
  total: number;
  /** Revoked, rolled and leak-revoked keys, newest first. */
  revoked?: ApiKeyRevoked[];
}

/** A newly issued key. `key` is returned ONCE and never again (or, with `secretRecipient`, sealed). */
export interface ApiKeyIssued {
  key: string;
  prefix: string;
  expiresAt?: number | null;
  scopes?: string[] | null;
  cbids?: string[] | null;
  /** No expiry, or one over 365 days. */
  warnings?: string[];
  /** With `secretRecipient`: the key, sealed (and `key` absent). */
  sealed_secret?: string;
  sealed_field?: string;
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
 * Input for issuing a new API key (POST /v1/keys). Every field is honoured: `scopes`, `cbids`,
 * `expiresInDays` / `expiresAt`, `name`, `owner` and `strictUnknownFields`.
 */
export interface ApiKeyIssueInput {
  /** `user:<id>`, `service:<name>` or `apikey:<prefix>`. Default: the calling key. */
  owner?: string;
  /** Writes with the new key refuse unknown body fields unless they send `Prefer: lenient-unknown-fields`. */
  strictUnknownFields?: boolean;
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
  /** Or when it expires: epoch ms or an ISO date-time (not with expiresInDays). Omit both: never. */
  expiresAt?: number | string;
}

/** One entitlement (suite-standard shape). A feature is `{key, enabled}`; a limit is `limits.<name>`. */
export interface Entitlement {
  key: string;
  enabled: boolean;
  /** Limits only. null = unlimited, 0 = not on this plan. */
  limit?: number | null;
  /** Limits the server meters, when metering is wired. */
  used?: number;
  source: 'plan';
}

/** GET /v1/entitlements: what the org may use, from its effective plan. */
export interface Entitlements {
  orgId: string;
  plan: string;
  planSource: 'org' | 'account';
  subscribedPlan: string;
  entitlements: Entitlement[];
  generatedAt: string;
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
  /** The endpoint lifecycle: `failing` from the first event that failed every retry, `disabled` after 72 hours. */
  state?: 'healthy' | 'failing' | 'disabled' | 'paused';
  failingSince?: number | null;
  disabledAt?: number | null;
  lastSuccessAt?: number | null;
  lastFailure?: { at: number; status: number | null; error: string | null } | null;
  lastDeliveryAt?: number | null;
  lastStatus?: number | null;
  consecutiveFailures?: number;
  /** Who is emailed when it fails; null: the organisation's owners. */
  alertContacts?: string[] | null;
  /** On an update that re-enabled a disabled endpoint: how to send what it missed. */
  replay?: { since: number; path: string };
}

/** POST /v1/webhooks/{id}/replay. */
export interface WebhookReplayResult {
  ok: boolean;
  replayed: number;
  failed: number;
  remaining: number;
  stoppedAt?: string;
  status?: number;
  error?: string;
}

/** The audit-log export (GET/PUT /v1/audit/sink). Never the secret. */
export interface AuditSink {
  type: 'webhook';
  url: string;
  secretSet: true;
  createdAt: number;
  updatedAt: number;
  lastDeliveryAt: number | null;
  lastStatus: number | null;
  lastError: string | null;
}
export interface AuditSinkInput {
  type: 'webhook';
  url: string;
  /** 16–256 characters; omitted: one is generated and returned once. */
  secret?: string;
}

/** GET /v1/sites/{cbid}/consent/insights. */
export interface ConsentInsights {
  cbid: string;
  from: number;
  to: number;
  totals: { impressions: number | null; decisions: number; optIns: number; optOuts: number; optInRate: number | null; decisionRate: number | null };
  byRegion: Array<{ region: string; decisions: number; optIns: number; optInRate: number | null }>;
  byVariant: Array<{ variant: string; impressions: number; optIns: number; optInRate: number | null }>;
  byVariantWindow: 'all_time';
  byLanguage: null;
  timeToDecision: null;
  notRecorded: { byLanguage: string; timeToDecision: string };
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

export type MailProviderKind = 'brevo' | 'sendgrid' | 'postmark' | 'resend' | 'ses' | 'smtp';

/**
 * The org's own mail provider for rights-request mail. The credential is never returned —
 * `secretLast4` only. `sender` says whether verification codes go through it right now
 * (`own`) or are not mailed at all (`none`): there is no shared sender for rights mail.
 */
export interface MailProvider {
  configured: boolean;
  sender: 'own' | 'none';
  provider?: MailProviderKind;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  ses?: { region: string; accessKeyId: string };
  smtp?: { host: string; port: number; security: 'tls' | 'starttls'; username: string };
  secretLast4?: string;
  status?: 'untested' | 'verified' | 'failing';
  verifiedAt?: number | null;
  lastTest?: { ok: boolean; at: number; error?: string } | null;
  updatedAt?: number;
  /** Only on `set`: no verification codes are mailed until a test succeeds. */
  note?: string;
}

/** Save a provider. `secret` is write-only; omit it to keep the stored one (same provider only). */
export interface MailProviderInput {
  provider: MailProviderKind;
  fromEmail: string;
  fromName?: string | null;
  replyTo?: string | null;
  secret?: string;
  ses?: { region: string; accessKeyId: string };
  smtp?: { host: string; port: 25 | 465 | 587 | 2525; security: 'tls' | 'starttls'; username: string };
}

export type RightsCaptchaProvider = 'turnstile' | 'hcaptcha' | 'recaptcha_v2' | 'recaptcha_v3';

/**
 * The rights page's captcha in force: your own keys (`own`, recommended) or none (`off`, the default).
 * Cookie Munch's own captcha is never used on rights pages. The secret is never returned.
 */
/** Whether hosted consent sync is set up for a site. The secret itself is never read back. */
export interface ConsentSyncSecret {
  cbid: string;
  configured: boolean;
  secretLast4: string | null;
  /** Epoch ms the current secret was minted. */
  createdAt: number | null;
}

/**
 * Who a preference-centre token is for: a site of your organisation and exactly one of `email`
 * (resolved as the emailed preference link resolves it) or `subjectId`.
 */
export type CenterTokenInput = { cbid: string; ttlSeconds?: number } & (
  | { email: string; subjectId?: never }
  | { subjectId: string; email?: never }
);

/** A preference-centre token. A credential: hand it to `CookieMunch.setSubjectToken`, never put it in a shared URL or a log. */
export interface CenterToken {
  token: string;
  /** ISO 8601. */
  expiresAt: string;
}

/** A freshly minted or rotated consent-sync secret: `secret` is shown this once. */
export interface ConsentSyncSecretMinted extends ConsentSyncSecret {
  secret: string;
}

export interface RightsCaptcha {
  /** `site`: the site's own setting; `org`: the organisation default; `default`: neither (off). */
  source: 'site' | 'org' | 'default';
  mode: 'own' | 'off';
  provider?: RightsCaptchaProvider;
  siteKey?: string;
  /** reCAPTCHA v3 only. */
  minScore?: number;
  secretSet: boolean;
  secretLast4?: string;
  status: 'verified' | 'disabled';
  verifiedAt: number | null;
  updatedAt: number | null;
  /** Only when a `set` turned the captcha off: what that costs. */
  warning?: string;
}

/**
 * `own` needs provider, siteKey and (the first time) secret; the provider is asked to accept the secret before
 * anything is saved (422 captcha_secret_invalid / 502 captcha_unreachable). `off` removes spam protection beyond
 * the hidden spam-trap field, the rate limits and the email code.
 */
export interface RightsCaptchaInput {
  mode: 'own' | 'off';
  provider?: RightsCaptchaProvider;
  siteKey?: string;
  /** Write-only. Omit to keep the stored one (same provider, same place). */
  secret?: string;
  /** reCAPTCHA v3 only: 0.1–0.9, default 0.5. */
  minScore?: number;
}

export type RightsIdentityType = 'clerk' | 'atlas' | 'oidc_jwt';

/**
 * The sign-in provider rights requests are verified with: a visitor signed in to your site is
 * verified by their session, with no code mail. Nothing here is secret.
 */
export interface RightsIdentity {
  /** `site`: the site's own setting; `org`: the organisation default; `default`: neither (none). */
  source: 'site' | 'org' | 'default';
  configured: boolean;
  type?: RightsIdentityType;
  issuer?: string;
  jwksUrl?: string;
  audience?: string;
  authorizedParties?: string[];
  emailClaim?: string;
  emailVerifiedClaim?: string;
  sessionCookieName?: string;
  /** Present (true) only when set: clerk/atlas tokens without the verified claim are accepted. */
  trustEmailClaim?: true;
  status: 'verified' | 'not_configured';
  verifiedAt: number | null;
  updatedAt: number | null;
}

/**
 * The JWKS is fetched and checked before anything is saved (502 identity_jwks_unreachable /
 * 422 identity_jwks_invalid). `authorizedParties` (your own origins) is required for clerk and atlas;
 * oidc_jwt needs an `audience` or `authorizedParties`. Issuer and JWKS URL are https on a host name,
 * never an IP address. The token must carry the email and a verified-email claim set to `true`
 * (clerk/atlas with `trustEmailClaim`: the verified claim may be absent).
 */
export interface RightsIdentityInput {
  type: RightsIdentityType;
  /** Exactly the token's `iss` (Clerk: your Frontend API URL). */
  issuer: string;
  /** Required for oidc_jwt; clerk/atlas default to `<issuer>/.well-known/jwks.json`. */
  jwksUrl?: string;
  audience?: string;
  authorizedParties?: string[];
  /** Default `email`. */
  emailClaim?: string;
  /** Default `email_verified`. */
  emailVerifiedClaim?: string;
  /** Default `__session`: the cookie the hosted page on your custom domain reads. */
  sessionCookieName?: string;
  /**
   * clerk/atlas only, default false. True when your provider has no verified-email claim and every
   * address it puts in the email claim is verified: a token without the verified claim is accepted.
   */
  trustEmailClaim?: boolean;
}

/** The organisation's own data-controller identity (GET /v1/org/controller). */
export interface OrgControllerIdentity {
  /** False when none is set; then only `updatedAt` (null) is present. */
  set: boolean;
  legalName?: string;
  contactEmail?: string;
  address?: string;
  /** The Data Protection Officer: a name, an email address, or both. */
  dpoContact?: string;
  updatedAt: number | null;
}

/** Replaces the identity: a field left out is removed. `legalName` is required. */
export interface OrgControllerInput {
  legalName: string;
  contactEmail?: string;
  address?: string;
  dpoContact?: string;
}

export interface MailProviderTestResult {
  ok: boolean;
  sentTo: string;
  error?: string;
  mailProvider: MailProvider;
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
  owner?: string;
  strictUnknownFields?: boolean;
  name?: string;
  scopes?: string[];
  cbids?: string[];
  /** A new expiry (epoch ms or ISO date-time), or null to remove it. */
  expiresAt?: number | string | null;
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
  /** false pauses delivery without deleting the subscription; true re-enables a disabled one. */
  active?: boolean;
  /** 1–10 addresses emailed when it fails; null: back to the organisation's owners. */
  alertContacts?: string[] | null;
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
  /** How many warning-severity consent-button parity findings the design has (0 = fair). */
  designWarningCount: number;
}

/** A full account-level banner record, including its config JSON. */
export interface BannerRecord {
  id: string;
  orgId: string;
  name: string;
  json: SiteConfig;
  createdAt: number;
  updatedAt: number;
  /** Consent-button parity findings in the design. Never blocks a save. */
  designWarnings?: ButtonParityFinding[];
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
  /**
   * Optional first step: turn the subject's email into the id this system uses. `noMatch`
   * names how the system says "no record of that person" in its body — a sentinel id is
   * never read as a person when it is set.
   */
  subjectLookup?: {
    method: 'GET' | 'POST';
    path: string;
    body?: unknown;
    idPath: string;
    noMatch?: { statusPath: string; values: string[] };
    /** How this system says the person was already removed; closes the task as `already_erased`. Checked before `noMatch`. */
    alreadyErased?: { statusPath: string; values: string[] };
  };
  /** Response header carrying the system's version, recorded in the task log. Default `X-Version`. */
  versionHeader?: string;
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
  poll: {
    method?: 'GET';
    path: string;
    statusPath: string;
    resultPath?: string;
    /** Whether `resultPath` holds the bundle itself or a URL to fetch it from. */
    resultIs?: 'inline' | 'url';
    /** Where a date the work is waiting for lives (an erasure in a grace period). */
    scheduledPath?: string;
  };
  /** That system's status words → the three answers a sub-task can have. */
  statuses: { running: string[]; done: string[]; failed: string[] };
  idempotencyHeader?: string;
  /**
   * An identity platform's app grant, revoked on erasure before anything else: look it up by
   * `{email}`, then end it with `{grant}`. A test looks it up but never revokes it.
   */
  grantRevoke?: {
    lookup: { method: 'GET' | 'POST'; path: string; body?: unknown; grantIdPath: string };
    revoke: { method: 'POST' | 'DELETE'; path: string; body?: unknown };
  };
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
  /** What the subject reads on this system's notice line when it holds nothing about them. */
  subjectNote?: string;
  createdAt: number;
  /** Where that system should send its completion webhooks. On every connection, secret or not. */
  webhookUrl: string;
  /**
   * The last canary health check (hourly, and on `testExecutor(id, { canary: true })`). null
   * until the first; cleared when the address, profile or key changes.
   */
  health: ExecutorHealth | null;
  /** The preset it was built from; absent when hand-written. */
  preset?: ExecutorPresetName;
  presetVersion?: number;
  /** Newer than `presetVersion`: `upgradeExecutorPreset` applies it. */
  presetLatestVersion?: number;
  /** The non-secret params it was built with, e.g. `{ orgId }`. */
  presetParams?: Record<string, string>;
  /** How the stored address and profile differ from what its preset version builds. Empty: unmodified. */
  presetDiff?: ConfigChange[];
  /** Preset-built: profile fields you removed or changed by hand; `upgradeExecutorPreset` keeps them. */
  profileOverrides?: Array<{ path: string; kind: 'removed' | 'changed'; at: number }>;
  /** Preset-built: true when it must not follow its preset. */
  presetPinned?: boolean;
  /** Your name for the credential. */
  label?: string;
  /** 2: orchestrator v2 headers on every call; 1: the v1 adapter every connection made before v2 has. */
  orchestrator?: 1 | 2;
  hasCompletionSecret?: boolean;
  completionSecretPrefix?: string;
  /** When a signed completion last verified; running work is then polled every 6 hours. */
  lastSignedCompletionAt?: number | null;
  /** Where signed cm-standard-v2 completions go. */
  completionsUrl?: string;
  /** On create only: the completion secret, shown this once. */
  completionSecret?: string;
}

/** POST …/completion-secret/roll. */
export interface CompletionSecretRolled {
  id: string;
  completionSecret: string;
  completionSecretPrefix: string;
  previousRetiresAt: string | null;
  completionsUrl?: string;
}

/** POST …/test {conformance: true}: the conformance kit's report. */
export interface ExecutorConformanceResult extends ConformanceReport {
  conformance: true;
  canary: true;
  email: string;
}

/** A connection's last health check. */
export interface ExecutorHealth {
  lastCheckedAt: number;
  ok: boolean;
  verdict: string;
  /** e.g. `base_url_redirects`, `credential_unavailable`. */
  code?: string;
  /** When a check last passed. */
  lastSuccessAt?: number;
  /** On reads: true when the last check is more than an hour old, with the command that re-checks it in `hint`. */
  stale?: boolean;
  hint?: string;
}

/** A preset's name, as `executorPresets()` lists them. Not enumerated here: presets are data. */
export type ExecutorPresetName = string;

/**
 * Connect a system from a versioned preset instead of a hand-written profile. Each preset
 * lists the params it takes (`executorPresets()`); a preset waiting on another platform is
 * refused with `preset_waiting_on_platform`.
 */
export interface DsarExecutorPresetInput {
  preset: ExecutorPresetName;
  presetVersion?: number;
  secretKey: string;
  system?: string;
  baseUrl?: string;
  orgId?: string;
  atlasIdAppId?: string;
  /** A preset param, when the preset lists it: default false. True adds an optional step revoking the person's app grant on erasure. */
  revokeAtlasIdGrant?: boolean;
  webhookSecret?: string;
  auto?: boolean;
  cbid?: string;
  /** Your name for the credential, shown beside `keyPrefix`. */
  label?: string;
  /** Default 2. */
  orchestrator?: 1 | 2;
}

/** What `upgradeExecutorPreset` takes: a version, a preset to adopt, or params to add. */
export interface ExecutorPresetUpgrade {
  preset?: ExecutorPresetName;
  presetVersion?: number;
  orgId?: string;
  atlasIdAppId?: string;
  revokeAtlasIdGrant?: boolean;
  /** Overridden paths (`profileOverrides`) that take the preset's value again; every other override is kept. */
  acceptPreset?: string | string[];
}

/** One step a preset builds, and whether it can run now (CMU-B01). */
export interface ExecutorPresetStep {
  name: 'subjectLookup' | 'open' | 'poll' | 'webhook' | 'grantRevoke';
  available: boolean;
  /** Never fails a connection: a credential without the scope reports `skipped: insufficient_scope`. */
  optional?: boolean;
  /** False: added only with `param`. */
  defaultOn: boolean;
  param?: string;
  note?: string;
  waitingOn?: { platform: string; items: string[]; operations: string[] };
}

/** The presets, which are usable now, and this org's canary address. */
export interface ExecutorPresets {
  canaryEmail: string;
  presets: Array<{
    name: ExecutorPresetName;
    title: string;
    latestVersion: number;
    defaultSystem?: string;
    params: Array<{ name: string; required: boolean; description: string; type?: 'string' | 'boolean' }>;
    available: boolean;
    waitingOn?: { platform: string; items: string[]; operations: string[] };
    steps: ExecutorPresetStep[];
  }>;
}

/** What a connection write would do (`?dryRun=1`). Nothing was stored. */
export interface DsarExecutorDryRun {
  dryRun: true;
  /** The connection as it would be, credentials excluded. A create has no `id` or `webhookUrl` yet. */
  executor: Partial<DsarExecutor> & Record<string, unknown>;
  /** Each field that would change. */
  diff: ConfigChange[];
  warnings?: Array<{ field: string; reason: string }>;
}

/** Where a webhook check stopped. */
export type WebhookStage = 'configuration' | 'headers' | 'timestamp' | 'prefix' | 'signature';

/** Which key a verified delivery matched: a `whsec_` secret's base64-decoded remainder, or the secret as typed. */
export type WebhookKeyForm = 'decoded' | 'raw';

/** Whether a supplied delivery verified (`stage` and `reason` are null when it did). */
export interface ExecutorWebhookTestResult {
  verified: boolean;
  stage: WebhookStage | null;
  reason: string | null;
  /** Which key form matched; null when refused. */
  keyForm: WebhookKeyForm | null;
}

/** One delivery to a connection's webhook. Never the secret, the signature or the body. */
export interface ExecutorWebhookDelivery {
  id: string;
  executorId: string;
  at: number;
  verified: boolean;
  stage: WebhookStage | null;
  reason: string | null;
  /** The HTTP status we answered with. */
  status: number;
  /** The first 16 hex characters of SHA-256 over the raw body. */
  bodySha256: string;
  bodyBytes: number;
  /** Which key form matched; null when refused (or logged before this was kept). Never the key. */
  keyForm: WebhookKeyForm | null;
}

export interface DsarExecutorInput {
  /** The name this connection answers to in a plan, e.g. `identity` or `crm`. */
  system: string;
  /** The system's public https origin. */
  baseUrl: string;
  /** Its API key. Stored encrypted; never returned. */
  secretKey: string;
  /**
   * The signing secret of its webhook endpoint. Optional — polling closes tasks without it.
   * A `whsec_<base64>` secret (standard base64 or base64url, padded or not) verifies a delivery
   * signed with either the base64-decoded bytes or the literal string; anything else only with
   * its UTF-8 bytes.
   */
  webhookSecret?: string;
  auto?: boolean;
  /** What the subject reads when this system holds nothing about them (≤500 chars, never a key). */
  subjectNote?: string;
  /** How to drive it. */
  profile: ExecutorProfile;
  /** Default 2. */
  orchestrator?: 1 | 2;
}

export type DsarExecutorCreated = DsarExecutor;

/** The fields `updateExecutor` may change. */
export interface DsarExecutorPatch {
  profile?: unknown;
  baseUrl?: string;
  secretKey?: string;
  webhookSecret?: string | null;
  auto?: boolean;
  /** null removes it. */
  subjectNote?: string | null;
  /** Your name for the credential; null removes it. */
  label?: string | null;
  /** Preset-built only: true stops `upgradeExecutorPreset` changing it. */
  presetPinned?: boolean;
  /** Opt in to (2) or out of (1) orchestrator v2. */
  orchestrator?: 1 | 2;
}

/** One entry in a fulfilment task's status history. */
export interface DsarTaskEvent {
  at: number;
  kind: 'created' | 'changed' | 'version_changed';
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  detail?: string;
  outcome?: DsarTaskOutcome;
  scheduledFor?: number;
  externalRef?: string;
}

/** What a task's answer means for the person. `exported` only once the export was fetched. */
export type DsarTaskOutcome = 'located' | 'exported' | 'erased' | 'no_record' | 'done_without_artifact' | 'not_applicable' | 'already_erased' | 'external_identity';

/** One request made to a connected system on a task's behalf, credentials removed. Kept 30 days. */
export interface DsarTaskLogEntry {
  id?: string;
  system?: string;
  step: 'lookup' | 'open' | 'poll' | 'export' | 'grant';
  method: string;
  path: string;
  /** Absent when the system never answered. */
  status?: number;
  latencyMs: number;
  requestHeaders?: Record<string, string>;
  /** The first ~2 KB of what was sent. */
  request?: string;
  /** The first ~2 KB of what came back. */
  response?: string;
  error?: string;
  /** The system's version header on this answer. */
  version?: string;
  /** This answer was a redirect (origin and path; never the query). Only same-origin, method-keeping ones are followed. */
  redirect?: { status: number; location: string };
  at: number;
}

/** One fulfilment task with its history and its upstream request log. */
export interface DsarTask {
  id: string;
  requestId: string;
  system: string;
  operation: FulfillmentOp;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  detail?: string;
  outcome?: DsarTaskOutcome;
  attempts: number;
  executor?: string;
  externalRef?: string;
  scheduledFor?: number;
  artifacts?: Array<{ kind: string; system: string; ref: string }>;
  createdAt: number;
  updatedAt: number;
  events: DsarTaskEvent[];
  log: DsarTaskLogEntry[];
  /** Versions the system reported while working on this task, in order of change. */
  upstreamVersions?: string[];
  /** The system was redeployed while this task was in flight. */
  versionChanged: boolean;
}

/** What testing a connection found. Nothing was filed. */
export interface ExecutorTestResult {
  system: string;
  /** Did the lookup find the person; null when there is no lookup step or it failed. */
  matched: boolean | null;
  subject?: string;
  operationWord?: string;
  /** The open request a real request would send, when it was not sent. */
  wouldSend?: { method: string; path: string; body: unknown };
  /** One sentence: what a real request would have done. */
  verdict: string;
  ok: boolean;
  /** Why not, when there is a code: `base_url_redirects` — the baseUrl redirected; the verdict names the status and target. */
  code?: string;
  /** The subject's app grant at an identity platform, when the profile has a grant step. Never revoked by a test. */
  grant?: string;
  /** Optional steps this credential may not run: reported, never a failure. */
  skipped?: Array<{ step: string; reason: 'insufficient_scope' }>;
  /** Present when the test used the org canary address, with the address in `email`. */
  canary?: boolean;
  email?: string;
  /** Every upstream answer, as the system gave it (credentials removed). */
  exchanges: DsarTaskLogEntry[];
}

export interface ExecutorTestInput {
  /** The address to look up. Required unless `canary` is true. */
  email?: string;
  /** Use this org's canary address — no real person. A canary `locate` also updates `health`. */
  canary?: boolean;
  /** Default `locate`. */
  operation?: 'locate' | 'export' | 'erase';
  /** For `export` only: open a real export and poll it once. An erasure is never sent. */
  open?: boolean;
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
  orgs: {
    /**
     * Every organisation on this key's account, each with its effective plan and where that
     * comes from, plus the per-account org cap and the upgrade URL. Needs an unscoped key that
     * is not locked to properties.
     */
    list(opts?: MetadataFilter): Promise<AccountOrgs>;
    /**
     * Create a sibling organisation owned by the same account — for a separate business of
     * your own. Needs an unscoped key. Not reseller provisioning, which is for your customers.
     */
    create(
      name: string,
      opts?: { mintKey?: boolean; keyScopes?: string[]; keyExpiresInDays?: number; keyOwner?: string } & ResourceTagsInput,
    ): Promise<{ org: { id: string; name: string; role: string }; apiKey?: string; keyError?: string }>;
    /** Hard-delete a SANDBOX organisation of this account (created with metadata.forgedeck_sandbox). Anything else: 403 not_a_sandbox. */
    deleteSandbox(id: string): Promise<SandboxPurge>;
  };
  /** Tags on any created resource (CMU-X29). */
  metadata: {
    get(type: TaggedType, id: string): Promise<ResourceTags>;
    /** Merge tags (null removes one). `forgedeck_sandbox` cannot be set here. `{ dryRun: true }` answers with the diff. */
    update(type: TaggedType, id: string, metadata: Record<string, string | number | boolean | null>, opts?: { dryRun?: boolean }): Promise<ResourceTagsUpdate>;
  };
  /** Partner links in the suite-standard shape (CMU-X34). */
  partnerLinks: {
    list(opts?: MetadataFilter): Promise<StandardPartnerLink[]>;
    create(input: StandardPartnerLinkCreate): Promise<StandardPartnerLink>;
    revoke(id: string): Promise<StandardPartnerLink>;
  };
  /** What `forgedeck env` writes for a product provisioned with this forgedeck ref: names, values, secret references. */
  provisionEnv(ref: string): Promise<ProvisionEnv>;
  sites: {
    list(opts?: MetadataFilter): Promise<Site[]>;
    create(input: SiteCreate & ResourceTagsInput): Promise<Site>;
    get(cbid: string): Promise<Site>;
    /**
     * Rename or move a site: domain, display name, aliases. The cbid and the consent ledger stay; a domain
     * move clears verification. `{ dryRun: true }` answers with the diff and stores nothing.
     */
    update(cbid: string, patch: SiteUpdate, opts?: { dryRun?: boolean }): Promise<SiteUpdateResult>;
    delete(cbid: string): Promise<void>;
    /** Purge a SANDBOX site: its consent ledger, declarations and test rights requests too. Anything else: 403 not_a_sandbox. */
    deleteSandbox(cbid: string): Promise<SandboxPurge>;
    /** Partner platforms granted this site's consent events, and the partners on offer. */
    listPartners(cbid: string): Promise<{ links: PartnerLink[]; partners: PartnerCatalogEntry[] }>;
    /** Grant a partner (Forumulate, Atlas) the site's consent events — no secret is created. Idempotent. */
    linkPartner(cbid: string, input: PartnerLinkCreate, opts?: { dryRun?: boolean }): Promise<{ change: 'created' | 'updated' | 'unchanged'; link: PartnerLink; dryRun?: true }>;
    /** Revoke a partner link: deliveries stop at once. */
    unlinkPartner(cbid: string, linkId: string): Promise<{ link: PartnerLink }>;
    getConfig(cbid: string): Promise<SiteConfig>;
    /**
     * Replaces the whole config — a top-level field you omit reverts to its default. With
     * `{ keep: 'unspecified' }` (`?keep=unspecified`) an omitted top-level field keeps its
     * stored value instead; each field you send is still replaced whole, and one sent as
     * `null` reverts to its default.
     */
    putConfig(cbid: string, config: SiteConfig, opts?: PutConfigOptions): Promise<SiteConfig>;
    /**
     * Changes some of the config — a JSON Merge Patch (RFC 7386): omitted fields keep their
     * stored value, nested objects merge, and `null` removes a field (it takes its default):
     * `{ banner: { i18n: { es: null } } }` drops the Spanish override. Arrays replace whole.
     */
    patchConfig(cbid: string, config: Partial<SiteConfig>): Promise<SiteConfig>;
    /**
     * Preview a config write without saving it: the merged result and a diff. `mode: 'put'`
     * previews a replace (the diff then lists everything that would revert to its default);
     * add `keep: 'unspecified'` to preview a replace that keeps omitted fields.
     */
    dryRunConfig(cbid: string, config: Partial<SiteConfig>, opts?: { mode?: 'patch' | 'put' } & PutConfigOptions): Promise<ConfigDryRun>;
    /**
     * Check a proposed config for consent-button parity — an Accept all pushed harder than
     * Reject all — without saving it. A partial v1 config is merged over the stored one (like
     * PATCH); a v2 design, or `replace: true`, is linted as sent. Needs only `sites:read`.
     */
    lintConfig(cbid: string, config: Partial<SiteConfig>, opts?: { replace?: boolean }): Promise<ButtonParityLint>;
    cookies(cbid: string): Promise<CookieDeclaration>;
    /**
     * Start a cookie crawl. Answers at once with `scanId` and `state: 'queued'`; `wait`
     * (seconds, ≤60) holds the request until the scan is done or failed.
     */
    scan(cbid: string, opts?: { wait?: number }): Promise<ScanStatus>;
    /** The last scan's state. `wait` (seconds, ≤60) holds the request until a running scan settles. */
    scanStatus(cbid: string, opts?: { wait?: number }): Promise<ScanStatus>;
    /**
     * Resolve once the site's scan is done or failed (read `state` and `error`), long-polling
     * the server. At `timeoutMs` (default 120 000) it resolves with the still-running state.
     */
    waitForScan(cbid: string, opts?: { timeoutMs?: number }): Promise<ScanStatus>;
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
    /**
     * Import AND declare: every row that mapped to one of our categories and has a purpose
     * is declared; the rest come back in `skipped`. Already-declared cookies are kept
     * unless `overwrite`.
     */
    applyImport(cbid: string, data: string, opts?: { overwrite?: boolean }): Promise<AppliedImport>;
    /**
     * Declare what one cookie is. Overrides scanned, observed and database classification
     * in the API, the preference modal and `data-cc="declaration"`. A name ending in `*`
     * declares a prefix wildcard. `dryRun` validates and returns the would-be list and a
     * diff without storing anything.
     */
    declareCookie(
      cbid: string,
      name: string,
      input: DeclaredCookieInput,
      opts?: { dryRun?: boolean },
    ): Promise<{ cookie: DeclaredCookie; warnings?: DeclarationWarning[] } & Partial<DeclarationDryRun>>;
    /**
     * Retire a cookie the site renamed or stopped setting: it leaves the banner's list,
     * `data-cc="declaration"` and the public feed, and stays listed for you with `retired`.
     * A name ending in `*` retires every cookie with that prefix. If a crawl or a visit sees
     * it again afterwards it is listed again, flagged `review: 'retired_but_seen'`.
     */
    retireCookie(
      cbid: string,
      name: string,
      input?: { renamedTo?: string; note?: string },
      opts?: { dryRun?: boolean },
    ): Promise<{ cookie: RetiredCookie; matched: string[]; dryRun?: true; retired?: RetiredCookie[] }>;
    /** Un-retire a cookie: it is listed again everywhere. */
    unretireCookie(cbid: string, name: string): Promise<void>;
    /** What un-retiring would leave; nothing is removed. */
    unretireCookie(cbid: string, name: string, opts: { dryRun: true }): Promise<{ dryRun: true; retired: RetiredCookie[] }>;
    /** Every declaration preset (atlas, forumulate, chatly, cookiemunch, referalli, firstpromoter, partnerstack, tapfiliate, impact): params, what it declared here, manifest status. */
    cookiePresets(cbid: string): Promise<{ presets: CookiePreset[]; aliases?: Record<string, string> }>;
    /**
     * Apply (or re-sync) a vendor preset: declares what that platform writes, marked
     * `vendor`. Names you declared yourself are kept (`skipped`). `dryRun` stores nothing.
     */
    applyCookiePreset(cbid: string, vendor: CookiePresetVendor, params?: CookiePresetParams, opts?: { dryRun?: boolean }): Promise<CookiePresetResult>;
    /**
     * Declare ANY vendor's cookies and storage from its embed manifest (`url`, re-read hourly, or
     * the `manifest` itself). The vendor id is the manifest's `product`; remove it with
     * removeCookiePreset(cbid, product). `dryRun` stores nothing.
     */
    importCookieManifest(cbid: string, input: CustomPresetInput, opts?: { dryRun?: boolean }): Promise<CookiePresetResult>;
    /** What to declare: detected vendors (script, storage, manifest) and one suggestion per undeclared row. */
    cookieSuggestions(cbid: string): Promise<CookieSuggestions>;
    /** Declare the suggestions: detected vendors' presets, then every other suggestion with a purpose. Try `dryRun` first. */
    declareCookieSuggestions(cbid: string, input?: { names?: string[]; presets?: boolean }, opts?: { dryRun?: boolean }): Promise<CookieSuggestionsDeclared>;
    /** Remove every declaration a vendor preset made. */
    removeCookiePreset(cbid: string, vendor: CookiePresetVendor | (string & {}), opts?: { dryRun?: boolean }): Promise<{ vendor: string; removed: string[]; dryRun?: true; declared?: DeclaredCookie[]; diff?: DeclarationDiff }>;
    /** Remove every stored (scanned or observed) row of this name. A declaration of it stays. */
    deleteObservedCookie(cbid: string, name: string): Promise<void>;
    /** What deleting it would remove; nothing is removed. */
    deleteObservedCookie(cbid: string, name: string, opts: { dryRun: true }): Promise<ObservedPurgeResult>;
    /**
     * Purge observed since T: remove every row a real visit first reported at or after
     * `since` (and before `until`). Crawled rows and declarations stay. ISO-8601 or epoch ms.
     */
    purgeObservedCookies(cbid: string, input: { since: string | number; until?: string | number }, opts?: { dryRun?: boolean }): Promise<ObservedPurgeResult>;
    /** Remove a declaration; the scanned classification applies again. */
    undeclareCookie(cbid: string, name: string): Promise<void>;
    /** What removing a declaration would leave; nothing is removed. */
    undeclareCookie(cbid: string, name: string, opts: { dryRun: true }): Promise<DeclarationDryRun>;
    /**
     * Declare many at once (all-or-nothing). `replace` also removes declarations not listed;
     * `dryRun` answers with what would be stored and a diff, storing nothing.
     */
    declareCookies(
      cbid: string,
      cookies: Array<DeclaredCookieInput & { name: string }>,
      opts?: { replace?: boolean; dryRun?: boolean },
    ): Promise<{ declared: DeclaredCookie[]; saved: number; removed: number; warnings?: DeclarationWarning[]; dryRun?: true; diff?: DeclarationDiff }>;
    snippet(cbid: string, opts?: SnippetOptions): Promise<InstallSnippet>;
    /**
     * Mint a short-lived signed token to see the banner as a visitor in a given region and
     * language sees it — even from a headless browser, and without recording anything.
     */
    previewToken(cbid: string, opts?: PreviewTokenOptions): Promise<PreviewToken>;
    verify(cbid: string, method: 'dns' | 'meta' | 'file' | 'embed'): Promise<VerifyResult>;
    /** Exactly what to publish to prove control of the domain, for each verification method. */
    verifyChallenge(cbid: string): Promise<unknown>;
    /** Create up to 100 sites. Partial success: a bad or duplicate item fails only itself. */
    createBulk(sites: BulkSiteInput[]): Promise<{ results: BulkSiteResult[] }>;
    brand(cbid: string): Promise<BrandExtractionResult>;
    /** Read back the brand.json last imported: each role, its source (brand.json or site), ignored[] and warnings[]. 404 when none. */
    getBrand(cbid: string): Promise<BrandReadBack>;
    /** Import a brand.json (`{url}` or the document) into the banner theme and the rights page. `dryRun` saves nothing. */
    setBrand(cbid: string, input: BrandImportInput, opts?: { dryRun?: boolean }): Promise<BrandReadBack>;
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
    /** Opt-in by region and A/B variant, and the decision rate. Language and time-to-decision are not recorded (null). */
    insights(cbid: string, query?: RangeQuery): Promise<ConsentInsights>;
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
    /**
     * The reserved categories any site can switch on with `categories.suite` (`support_chat`,
     * `referrals`): stance, fallback, regulatory basis, wording in every banner language, and
     * known vendors. Public — `GET /v1/categories/registry` needs no key.
     */
    categoryRegistry(): Promise<CategoryRegistry>;
  };
  dsar: {
    list(): Promise<DsarRequest[]>;
    /**
     * One request, in the same shape `list` returns — note that `create` answers with it
     * wrapped as `{ request }`, so `create(...).request.id` is what you pass here.
     */
    get(id: string): Promise<DsarRequest>;
    create(input: DsarCreate & ResourceTagsInput): Promise<{ request: DsarRequest }>;
    /** `opts.messageToSubject` replaces the line the subject reads in the notice — for a rejection, why. */
    advance(id: string, toStatus: DsarStatus, opts?: { messageToSubject?: string }): Promise<{ request: DsarRequest }>;
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
    /**
     * Delete a TEST request (created with `test: true`), with its tasks and their log. A
     * real request cannot be deleted (409 `not_a_test_request`); the deletion is audited.
     */
    delete(id: string): Promise<void>;
    /**
     * Mark a CLOSED request (completed or rejected) as a test, after the fact — for trials
     * filed before `test` existed. An open one is refused (409 `request_not_closed`). Audited
     * as `dsar.marked_test`; afterwards `delete` works on it. `changed` is false on a repeat.
     */
    markTest(id: string): Promise<{ request: DsarRequest; changed: boolean }>;
    /** Requests carrying one X-ForgeDeck-Trace (`GET /v1/dsar?trace=`). */
    listByTrace(trace: string): Promise<DsarRequest[]>;
    /**
     * Open a case fanned out to every connected system (POST /v1/dsar/requests). `opts.idempotencyKey`
     * (16–128 chars) makes a retry answer the same case; `opts.trace` passes your X-ForgeDeck-Trace on.
     */
    openCase(input: DsarCaseCreate, opts?: { idempotencyKey?: string; trace?: string }): Promise<DsarCase>;
    /** One case across every system. */
    getCase(id: string): Promise<DsarCase>;
    /** Cancel a case before executeAfter; status `cancelled` once every system confirmed. */
    cancelCase(id: string): Promise<DsarCase>;
    /** The signed receipt for a case. */
    caseReceipt(id: string): Promise<DsarCaseReceipt>;
    /** The signed receipt as a PDF. */
    caseReceiptPdf(id: string): Promise<ArrayBuffer>;
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
  /** The hosted rights page (cookiemunch.net/r/<cbid> or the site's own domain). */
  rightsPage: {
    get(cbid: string): Promise<RightsPageDraft>;
    /** Replace the draft. Nothing is live until publish(). `opts.baseUpdatedAt` refuses to overwrite a newer save (409 draft_conflict). */
    put(cbid: string, page: RightsPageDocument, opts?: RightsPageWriteOptions): Promise<RightsPageDraft>;
    /** Merge into the draft: objects merge, arrays replace, null removes. `opts.baseUpdatedAt` as on put(). */
    patch(cbid: string, patch: Record<string, unknown>, opts?: RightsPageWriteOptions): Promise<RightsPageDraft>;
    /** Validate a write without saving it. */
    dryRun(cbid: string, page: Record<string, unknown>, opts?: { mode?: 'patch' | 'put' }): Promise<RightsPageDryRun>;
    getPublished(cbid: string): Promise<RightsPagePublished>;
    /**
     * Publish the draft; it goes live at once. Pass `opts.baseUpdatedAt` (the draft's updatedAt
     * as you read it) so only the draft you saw goes live: 409 draft_conflict otherwise.
     */
    publish(cbid: string, opts?: RightsPageWriteOptions): Promise<RightsPagePublishResult>;
    versions(cbid: string): Promise<RightsPageVersions>;
    /**
     * Publish an earlier version again; it goes live at once and REPLACES the current draft
     * (unpublished edits are lost). `opts.baseUpdatedAt` refuses with 409 if the draft moved.
     */
    rollback(cbid: string, version: number, opts?: RightsPageWriteOptions): Promise<RightsPagePublishResult>;
    /** Custom hostnames serving the rights page, with the plan allowance. */
    listDomains(cbid: string): Promise<RightsPageDomainList>;
    /** Add a custom hostname (e.g. privacy.example.com); the answer carries the DNS records to create. */
    addDomain(cbid: string, hostname: string): Promise<RightsPageDomain>;
    /** Check it now: DNS while pending, the HTTPS answer once routed. Always the domain as it stands. */
    verifyDomain(cbid: string, hostname: string): Promise<RightsPageDomain>;
    /** Remove it: it stops being served and its certificate is not renewed. */
    removeDomain(cbid: string, hostname: string): Promise<void>;
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
    executors(opts?: MetadataFilter): Promise<DsarExecutor[]>;
    /** One connection with its full profile, never the credentials. Read it before changing `profile`: `updateExecutor` replaces the whole profile. */
    executor(id: string): Promise<DsarExecutor>;
    /**
     * Connect one. The secret is stored encrypted and never returned; the response carries
     * the URL to point that system's webhook at.
     */
    connectExecutor(input: (DsarExecutorInput | DsarExecutorPresetInput) & ResourceTagsInput): Promise<DsarExecutorCreated>;
    /**
     * Change a connection in place. Only what you send changes, and the stored credential
     * is kept unless you pass a new `secretKey` — so adding a field to a profile does not
     * cost you the connection or its id.
     */
    updateExecutor(id: string, patch: DsarExecutorPatch): Promise<DsarExecutor>;
    /** What `connectExecutor` would create, validated in full; nothing is stored (`?dryRun=1`). */
    dryRunConnectExecutor(input: DsarExecutorInput | DsarExecutorPresetInput): Promise<DsarExecutorDryRun>;
    /** The versioned presets, whether each is usable now (or waits on another platform), and the org canary address. */
    executorPresets(): Promise<ExecutorPresets>;
    /**
     * Rebuild a connection from its preset's latest version (or `presetVersion`), keeping its id
     * and credentials; or adopt a preset on a hand-written one by naming it. Answers with `diff`.
     */
    upgradeExecutorPreset(id: string, input?: ExecutorPresetUpgrade): Promise<DsarExecutor & { diff: ConfigChange[]; warnings?: Array<{ field: string; reason: string }> }>;
    /** What `upgradeExecutorPreset` would change; nothing is stored (`?dryRun=1`). */
    dryRunUpgradeExecutorPreset(id: string, input?: ExecutorPresetUpgrade): Promise<DsarExecutorDryRun>;
    /** What `updateExecutor` would change, with a diff; the stored connection is untouched (`?dryRun=1`). */
    dryRunUpdateExecutor(id: string, patch: DsarExecutorPatch): Promise<DsarExecutorDryRun>;
    /**
     * Would this webhook delivery verify? Runs the receiver's exact check on headers and a raw
     * body you supply, acts on nothing, and names the stage that failed.
     */
    testExecutorWebhook(id: string, delivery: { headers: Record<string, string>; body: string }): Promise<ExecutorWebhookTestResult>;
    /** The last 50 deliveries to a connection's webhook, newest first, each with its reason. */
    executorWebhookDeliveries(id: string): Promise<ExecutorWebhookDelivery[]>;
    /** Disconnect a system; its open sub-tasks stop being driven. */
    disconnectExecutor(id: string): Promise<void>;
    /** The export bundle a connected system produced, fetched from it on demand. */
    taskExport(requestId: string, taskId: string): Promise<DsarTaskExport>;
    /**
     * One task: its status history (`events`), every request made to a connected system on
     * its behalf (`log`, redacted, 30 days) and whether that system's version changed mid-way.
     */
    task(requestId: string, taskId: string): Promise<DsarTask>;
    /**
     * Try a connection against one email without filing anything: runs the lookup, returns
     * the raw (redacted) upstream answers and what a real request would have sent.
     */
    testExecutor(id: string, input: ExecutorTestInput): Promise<ExecutorTestResult>;
    /** Re-check a connection now (a canary test that records its health); for a deploy pipeline. */
    recheckExecutor(id: string): Promise<ExecutorTestResult>;
    /** A connection's last health checks, newest first (`limit` 1 to 50, default 50). */
    executorHealthHistory(id: string, opts?: { limit?: number }): Promise<ExecutorHealth[]>;
    /** Run the cm-standard-v2 conformance kit against a connection, on the canary subject only. */
    executorConformance(id: string): Promise<ExecutorConformanceResult>;
    /** A new completion secret, shown once; the old one keeps verifying for 24 hours. */
    rollExecutorCompletionSecret(id: string): Promise<CompletionSecretRolled>;
  };
  preferences: {
    list(): Promise<PreferenceItem[]>;
    /** Save/update a subject's named-purpose opt-ins. Returns the persisted record. */
    save(subjectId: string, purposes: Record<string, boolean>): Promise<{ record: PreferenceRecord }>;
    /** One subject's record. A subject with none has empty `purposes`. */
    get(subjectId: string): Promise<PreferenceRecord>;
  };
  /** The hosted preference centre, opened for a visitor your server has signed in. */
  preferenceCenter: {
    /**
     * Mint a preference-centre token (POST /v1/preference-center/tokens) for the page to pass to
     * `CookieMunch.setSubjectToken`. Server-side only: the token opens that subject's subscriptions
     * and profile until `expiresAt`. `ttlSeconds` defaults to 3600, at most 86400. Needs
     * subscriptions:write and profile:write, plus identity:read when minting by email.
     */
    mintToken(input: CenterTokenInput): Promise<CenterToken>;
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
    /** Key hygiene: keys unused for `unusedDays` (default 90), broad keys, keys expiring within `expiringDays` (default 14). */
    report(opts?: { unusedDays?: number; expiringDays?: number }): Promise<ApiKeyReport>;
    /** The suite-standard listing (`?shape=standard`). */
    listStandard(): Promise<StandardKeyList>;
    /** The calling key itself, whatever its scopes: check its own expiry. */
    self(): Promise<ApiKeyPrefix>;
    /** The calling key rotates itself; the old secret stops at once. Use a client with an Idempotency-Key header. */
    rollSelf(): Promise<ApiKeyIssued>;
    /** A short-lived key (ttlSeconds at most 43200) within this key's own scopes and properties. Needs keys:write or full access. */
    vend(input: { scopes: string[]; ttlSeconds: number; cbids?: string[]; name?: string }): Promise<ApiKeyVended>;
    /** Revoke a leaked secret (works without a valid key; always answers { received }). */
    revokeLeaked(report: LeakReport): Promise<{ received: number }>;
  };
  usage(): Promise<Usage>;
  /** What the org may use: every plan feature (`whiteLabel`, `tcf`, …) and limit, in the suite-standard shape. Any key may read it. */
  entitlements(): Promise<Entitlements>;
  /** Every link a site's privacy wiring depends on, one row each with `ok` and a fix hint. `cbid` may be omitted with one site. */
  integrationHealth(cbid?: string): Promise<IntegrationHealthReport>;
  /** Waive a health check you chose not to meet: the row reports `ok: null` with `waived`. Audited. */
  healthWaivers: {
    list(cbid?: string): Promise<{ cbid: string; waivers: HealthWaiver[] }>;
    set(input: HealthWaiverInput): Promise<{ waiver: HealthWaiver }>;
    remove(check: string, opts?: { cbid?: string; subject?: string }): Promise<void>;
  };
  /**
   * The site's embed manifest: the tenant variant of `/.well-known/forgedeck-embed.json` — every
   * origin by CSP directive and every browser key the embed writes for this site's config. Public.
   */
  embedManifest(cbid: string): Promise<EmbedManifest>;
  /**
   * Wire a product's privacy in one call: the site, connected systems, Atlas and Forumulate. Idempotent;
   * `{ dryRun: true }` writes nothing anywhere. No secret appears in the answer.
   */
  provision(input: ProvisionRequest | ProvisionRequestV2, opts?: { dryRun?: boolean; fromStep?: string }): Promise<ProvisionResult>;
  /** The key's organisation. Requires an unscoped key that is not property-locked. */
  org: {
    get(): Promise<Org>;
    /** Rename the org or set its logo. Deleting the org is not available through the API. */
    update(patch: OrgUpdate): Promise<Org>;
    /**
     * Your own mail provider for rights-request mail. It carries verification codes once
     * `test` succeeds; every `set` clears that. There is no shared sender: without one, requests
     * are verified by your sign-in provider (`rightsIdentity`) or filed unverified for you to confirm.
     */
    mailProvider: {
      get(): Promise<MailProvider>;
      set(input: MailProviderInput): Promise<MailProvider>;
      remove(): Promise<void>;
      /** Send a test through your provider. `to` defaults to the reply-to, else the from address. */
      test(to?: string): Promise<MailProviderTestResult>;
    };
    /**
     * Your organisation's own data-controller identity: who every rights notice names, before any site config
     * `controller` block. Needed for a notice on a request filed without a cbid when you have several sites.
     * An unscoped key, or `rights:write`.
     */
    controller: {
      get(): Promise<OrgControllerIdentity>;
      /** Replace it: a field left out is removed. */
      set(input: OrgControllerInput): Promise<OrgControllerIdentity>;
      remove(): Promise<void>;
    };
    /**
     * The default captcha for your rights pages, for every site without its own (`rightsCaptcha`): your own
     * keys (recommended) or off. Without one, rights pages have no captcha.
     */
    rightsCaptcha: {
      get(): Promise<RightsCaptcha>;
      set(input: RightsCaptchaInput): Promise<RightsCaptcha>;
      /** Remove the default; answers the setting now in force (off). */
      remove(): Promise<RightsCaptcha>;
    };
    /** The default sign-in provider rights requests are verified with, for every site without its own. */
    rightsIdentity: {
      get(): Promise<RightsIdentity>;
      set(input: RightsIdentityInput): Promise<RightsIdentity>;
      /** Remove the default; answers the setting now in force. */
      remove(): Promise<RightsIdentity>;
    };
  };
  /** The org's audit log, newest first. API actions appear as `apikey:<prefix>`. */
  /** `{ actor: 'self' }` reads the calling key's own rows, the one form a scoped key may call. */
  audit(limit?: number, opts?: { actor?: string }): Promise<{ entries: AuditEntry[] }>;
  /** Stream the audit log to an HTTPS endpoint as CloudEvents 1.0. Unscoped keys. */
  auditSink: {
    get(): Promise<{ sink: AuditSink }>;
    set(input: AuditSinkInput): Promise<{ sink: AuditSink; secret?: string }>;
    remove(): Promise<void>;
  };
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
    list(opts?: MetadataFilter): Promise<WebhookSubscription[]>;
    create(input: WebhookCreate & ResourceTagsInput): Promise<WebhookSubscription>;
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
    /** Send what a failing or disabled endpoint missed since `since` (epoch ms or ISO), oldest first, stopping at the first failure. */
    replay(id: string, since: number | string, opts?: { limit?: number }): Promise<WebhookReplayResult>;
  };
  /**
   * Account-linked rights requests: a single-use link to the hosted rights page for a person your
   * backend knows is signed in. The page locks their email and skips the code step. Requires dsar:write.
   */
  rightsLinks: {
    create(cbid: string, input: RightsLinkInput): Promise<RightsLink>;
  };
  /**
   * A site's consent-sync signing secret: your server signs consent-sync tokens with it
   * (`mintConsentSyncToken`) so a visitor's decision syncs across their browsers. `rotate` mints the
   * first one or replaces it (the old one stops at once) and is the only time the secret is returned.
   * Reading needs sites:read; rotate and remove need sites:write and consent:write.
   */
  consentSyncSecret: {
    get(cbid: string): Promise<ConsentSyncSecret>;
    rotate(cbid: string): Promise<ConsentSyncSecretMinted>;
    /** Turn hosted consent sync off for the site. */
    remove(cbid: string): Promise<ConsentSyncSecret>;
  };
  /**
   * A site's rights-page captcha: your own Turnstile, hCaptcha or reCAPTCHA keys (recommended), or off. A site
   * without its own setting uses the organisation default (`org.rightsCaptcha`), else off. Requires sites:read / sites:write.
   */
  rightsCaptcha: {
    get(cbid: string): Promise<RightsCaptcha>;
    set(cbid: string, input: RightsCaptchaInput): Promise<RightsCaptcha>;
    /** Remove the site's own setting: it inherits the organisation default again. Answers the setting now in force. */
    remove(cbid: string): Promise<RightsCaptcha>;
  };
  /**
   * A site's sign-in provider (Clerk, Atlas or any JWKS issuer): a visitor signed in to your site
   * is verified by their session, with no code mail. A site without its own setting uses the
   * organisation default (`org.rightsIdentity`). Requires sites:read / sites:write.
   */
  rightsIdentity: {
    get(cbid: string): Promise<RightsIdentity>;
    set(cbid: string, input: RightsIdentityInput): Promise<RightsIdentity>;
    /** Remove the site's own setting: it inherits the organisation default again. */
    remove(cbid: string): Promise<RightsIdentity>;
  };
  /** A site's rights-request settings: graceDays (0–30; 7 for a new site, 0 until set for one that existed before). Requires dsar:read / dsar:write. */
  dsarSettings: {
    get(cbid: string): Promise<DsarSettings>;
    set(cbid: string, input: { graceDays: number }): Promise<DsarSettings>;
  };
  /** Cards for support, CRM and helpdesk sidebars. Requires dsar:read. */
  integrations: {
    /** Open rights requests for one person, by identity (preferred) or email. */
    subjectCard(app: string, person: { iss: string; sub: string } | { email: string }): Promise<SubjectCard>;
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

/** `?metadata[k]=v&…` from a MetadataFilter. */
function metaQs(o: MetadataFilter | undefined): string {
  const parts = Object.entries(o?.metadata ?? {}).map(([k, v]) => `metadata%5B${encodeURIComponent(k)}%5D=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
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

  async function request(method: string, path: string, body?: unknown, raw = false, extraHeaders: Record<string, string> = {}): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${opts.apiKey}`, 'User-Agent': opts.userAgent ?? `cookiemunch-js/${SDK_VERSION}`, ...extraHeaders };
    if (opts.strictUnknownFields && method !== 'GET') headers['Prefer'] = 'strict-unknown-fields';
    if (opts.secretRecipient && method !== 'GET') headers['X-Secret-Recipient'] = opts.secretRecipient;
    for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k] = v;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await doFetch(`${base}${path}`, init);
    if (!res.ok) {
      let message = `request failed with status ${res.status}`;
      let code: string | undefined;
      let parsed: unknown;
      try {
        const data = (await res.json()) as { error?: string; code?: string };
        parsed = data;
        if (typeof data.error === 'string') message = data.error;
        if (typeof data.code === 'string') code = data.code;
      } catch {
        /* non-JSON error body — keep the default message */
      }
      throw new CookieMunchApiError(res.status, message, code, parsed);
    }
    if (res.status === 204) return undefined;
    if (raw) return res.text();
    const contentType = res.headers.get('content-type') ?? '';
    return contentType.includes('application/json') ? res.json() : res.text();
  }

  const get = (p: string) => request('GET', p);
  /** A binary answer (a PDF), as bytes. */
  async function requestBytes(path: string): Promise<ArrayBuffer> {
    const res = await doFetch(`${base}${path}`, { method: 'GET', headers: { Authorization: `Bearer ${opts.apiKey}`, 'User-Agent': opts.userAgent ?? `cookiemunch-js/${SDK_VERSION}` } });
    if (!res.ok) {
      let message = `request failed with status ${res.status}`;
      let code: string | undefined;
      try {
        const data = (await res.json()) as { error?: string; code?: string };
        if (typeof data.error === 'string') message = data.error;
        if (typeof data.code === 'string') code = data.code;
      } catch {
        /* keep the default message */
      }
      throw new CookieMunchApiError(res.status, message, code);
    }
    return res.arrayBuffer();
  }
  const enc = encodeURIComponent;

  return {
    me: () => get('/me') as Promise<Identity>,
    languages: () => get('/languages') as Promise<SupportedLanguage[]>,
    orgs: {
      list: (o) => get(`/orgs${metaQs(o)}`) as Promise<AccountOrgs>,
      create: (name, opts) =>
        request('POST', '/orgs', { name, ...(opts ?? {}) }) as Promise<{
          org: { id: string; name: string; role: string };
          apiKey?: string;
          keyError?: string;
        }>,
      deleteSandbox: (id) => request('DELETE', `/orgs/${enc(id)}?hard=1`) as Promise<SandboxPurge>,
    },
    metadata: {
      get: (type, id) => get(`/metadata/${enc(type)}/${enc(id)}`) as Promise<ResourceTags>,
      update: (type, id, metadata, o) => request('PATCH', `/metadata/${enc(type)}/${enc(id)}${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, { metadata }) as Promise<ResourceTagsUpdate>,
    },
    partnerLinks: {
      list: (o) => get(`/partner_links${metaQs(o)}`) as Promise<StandardPartnerLink[]>,
      create: (input) => request('POST', '/partner_links', input) as Promise<StandardPartnerLink>,
      revoke: (id) => request('DELETE', `/partner_links/${enc(id)}`) as Promise<StandardPartnerLink>,
    },
    provisionEnv: (ref) => get(`/provision/env${qs({ ref })}`) as Promise<ProvisionEnv>,
    sites: {
      list: (o) => get(`/sites${metaQs(o)}`) as Promise<Site[]>,
      create: (input) => request('POST', '/sites', input) as Promise<Site>,
      get: (cbid) => get(`/sites/${enc(cbid)}`) as Promise<Site>,
      update: (cbid, patch, o) => request('PATCH', `/sites/${enc(cbid)}${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, patch) as Promise<SiteUpdateResult>,
      delete: async (cbid) => {
        await request('DELETE', `/sites/${enc(cbid)}`);
      },
      deleteSandbox: (cbid) => request('DELETE', `/sites/${enc(cbid)}?hard=1`) as Promise<SandboxPurge>,
      listPartners: (cbid) => get(`/sites/${enc(cbid)}/partners`) as Promise<{ links: PartnerLink[]; partners: PartnerCatalogEntry[] }>,
      linkPartner: (cbid, input, o) =>
        request('POST', `/sites/${enc(cbid)}/partners${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, input) as Promise<{ change: 'created' | 'updated' | 'unchanged'; link: PartnerLink; dryRun?: true }>,
      unlinkPartner: (cbid, linkId) => request('DELETE', `/sites/${enc(cbid)}/partners/${enc(linkId)}`) as Promise<{ link: PartnerLink }>,
      getConfig: (cbid) => get(`/sites/${enc(cbid)}/config`) as Promise<SiteConfig>,
      putConfig: (cbid, config, opts) =>
        request('PUT', `/sites/${enc(cbid)}/config${qs({ keep: opts?.keep })}`, config) as Promise<SiteConfig>,
      patchConfig: (cbid, config) => request('PATCH', `/sites/${enc(cbid)}/config`, config) as Promise<SiteConfig>,
      dryRunConfig: (cbid, config, opts) =>
        request(
          opts?.mode === 'put' ? 'PUT' : 'PATCH',
          `/sites/${enc(cbid)}/config${qs({ dryRun: 1, keep: opts?.mode === 'put' ? opts.keep : undefined })}`,
          config,
        ) as Promise<ConfigDryRun>,
      lintConfig: (cbid, config, opts) =>
        request('POST', `/sites/${enc(cbid)}/config/lint${qs({ replace: opts?.replace ? 1 : undefined })}`, config) as Promise<ButtonParityLint>,
      cookies: (cbid) => get(`/sites/${enc(cbid)}/cookies`) as Promise<CookieDeclaration>,
      scan: (cbid, o) => request('POST', `/sites/${enc(cbid)}/scan${qs({ wait: o?.wait })}`) as Promise<ScanStatus>,
      scanStatus: (cbid, o) => get(`/sites/${enc(cbid)}/scan${qs({ wait: o?.wait })}`) as Promise<ScanStatus>,
      waitForScan: async (cbid, o) => {
        const until = Date.now() + (o?.timeoutMs ?? 120_000);
        for (;;) {
          const left = until - Date.now();
          const asked = Math.max(0, Math.min(60_000, left));
          const t0 = Date.now();
          const s = (await get(`/sites/${enc(cbid)}/scan${qs({ wait: asked / 1000 })}`)) as ScanStatus;
          // Under 50 ms left, another poll can't learn anything (and a timer that fires a hair
          // early would otherwise buy one more request at the deadline).
          if (s.status !== 'scanning' || until - Date.now() < 50) return s;
          // A server that answered sooner than asked (one without long-polling) is not hammered.
          const early = Math.min(1000, until - Date.now()) - (Date.now() - t0);
          if (early > 0) await new Promise((r) => setTimeout(r, early));
        }
      },
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
      applyImport: (cbid, data, o) =>
        request('POST', `/sites/${enc(cbid)}/import${qs({ apply: '1', overwrite: o?.overwrite ? '1' : undefined })}`, { data }) as Promise<AppliedImport>,
      declareCookie: (cbid, name, input, o) =>
        request('PUT', `/sites/${enc(cbid)}/cookies/${enc(name)}${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, input) as Promise<
          { cookie: DeclaredCookie; warnings?: DeclarationWarning[] } & Partial<DeclarationDryRun>
        >,
      retireCookie: (cbid, name, input, o) =>
        request('POST', `/sites/${enc(cbid)}/cookies/${enc(name)}/retire${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, input ?? {}) as Promise<{
          cookie: RetiredCookie;
          matched: string[];
          dryRun?: true;
          retired?: RetiredCookie[];
        }>,
      unretireCookie: (async (cbid: string, name: string, o?: { dryRun?: boolean }) => {
        const out = await request('DELETE', `/sites/${enc(cbid)}/cookies/${enc(name)}/retire${qs({ dryRun: o?.dryRun ? '1' : undefined })}`);
        return o?.dryRun ? out : undefined;
      }) as CookieMunchClient['sites']['unretireCookie'],
      cookiePresets: (cbid) => get(`/sites/${enc(cbid)}/cookies/presets`) as Promise<{ presets: CookiePreset[]; aliases?: Record<string, string> }>,
      applyCookiePreset: (cbid, vendor, params, o) =>
        request('PUT', `/sites/${enc(cbid)}/cookies/presets/${enc(vendor)}${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, params ?? {}) as Promise<CookiePresetResult>,
      importCookieManifest: (cbid, input, o) =>
        request('PUT', `/sites/${enc(cbid)}/cookies/presets/custom${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, input) as Promise<CookiePresetResult>,
      cookieSuggestions: (cbid) => get(`/sites/${enc(cbid)}/cookies/suggestions`) as Promise<CookieSuggestions>,
      declareCookieSuggestions: (cbid, input, o) =>
        request('POST', `/sites/${enc(cbid)}/cookies/suggestions/declare${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, input ?? {}) as Promise<CookieSuggestionsDeclared>,
      removeCookiePreset: (cbid, vendor, o) =>
        request('DELETE', `/sites/${enc(cbid)}/cookies/presets/${enc(vendor)}${qs({ dryRun: o?.dryRun ? '1' : undefined })}`) as Promise<{
          vendor: CookiePresetVendor;
          removed: string[];
          dryRun?: true;
          declared?: DeclaredCookie[];
          diff?: DeclarationDiff;
        }>,
      deleteObservedCookie: (async (cbid: string, name: string, o?: { dryRun?: boolean }) => {
        const out = await request('DELETE', `/sites/${enc(cbid)}/observed-cookies/${enc(name)}${qs({ dryRun: o?.dryRun ? '1' : undefined })}`);
        return o?.dryRun ? (out as ObservedPurgeResult) : undefined;
      }) as CookieMunchClient['sites']['deleteObservedCookie'],
      purgeObservedCookies: (cbid, input, o) =>
        request('POST', `/sites/${enc(cbid)}/observed-cookies/purge${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, input) as Promise<ObservedPurgeResult>,
      undeclareCookie: (async (cbid: string, name: string, o?: { dryRun?: boolean }) => {
        const out = await request('DELETE', `/sites/${enc(cbid)}/cookies/${enc(name)}${qs({ dryRun: o?.dryRun ? '1' : undefined })}`);
        return o?.dryRun ? (out as DeclarationDryRun) : undefined;
      }) as CookieMunchClient['sites']['undeclareCookie'],
      declareCookies: (cbid, cookies, o) =>
        request('PUT', `/sites/${enc(cbid)}/cookies${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, { cookies, ...(o?.replace ? { replace: true } : {}) }) as Promise<{
          declared: DeclaredCookie[];
          saved: number;
          removed: number;
          warnings?: DeclarationWarning[];
          dryRun?: true;
          diff?: DeclarationDiff;
        }>,
      snippet: (cbid, opts) =>
        get(`/sites/${enc(cbid)}/snippet${qs({ blockingmode: opts?.blockingMode, culture: opts?.culture })}`) as Promise<InstallSnippet>,
      previewToken: (cbid, o) => request('POST', `/sites/${enc(cbid)}/preview-token`, o ?? {}) as Promise<PreviewToken>,
      verify: (cbid, method) => request('POST', `/sites/${enc(cbid)}/verify`, { method }) as Promise<VerifyResult>,
      verifyChallenge: (cbid) => get(`/sites/${enc(cbid)}/verify/challenge`),
      createBulk: (sites) => request('POST', '/sites/bulk', { sites }) as Promise<{ results: BulkSiteResult[] }>,
      brand: (cbid) => request('POST', `/sites/${enc(cbid)}/brand`, {}) as Promise<BrandExtractionResult>,
      getBrand: (cbid) => get(`/sites/${enc(cbid)}/brand`) as Promise<BrandReadBack>,
      setBrand: (cbid, input, o) => request('PUT', `/sites/${enc(cbid)}/brand${qs({ dryRun: o?.dryRun ? '1' : undefined })}`, input) as Promise<BrandReadBack>,
      getFlow: (cbid) => get(`/sites/${enc(cbid)}/flow`) as Promise<SiteFlow>,
      editFlow: (cbid, operations) =>
        request('POST', `/sites/${enc(cbid)}/flow/ops`, { operations }) as Promise<FlowOpResponse>,
      setFlow: (cbid, config) => request('PUT', `/sites/${enc(cbid)}/flow`, config) as Promise<FlowOpResponse>,
    },
    consent: {
      verify: (cbid) => get(`/sites/${enc(cbid)}/consent/verify`) as Promise<{ valid: boolean }>,
      stats: (cbid, query) => get(`/sites/${enc(cbid)}/consent/stats${qs(toQuery(query))}`) as Promise<ConsentDay[]>,
      insights: (cbid, query) => get(`/sites/${enc(cbid)}/consent/insights${qs(toQuery(query))}`) as Promise<ConsentInsights>,
      log: (cbid, query) => get(`/sites/${enc(cbid)}/consent/log${qs(toQuery(query))}`) as Promise<ConsentLogRow[]>,
      export: (cbid, query) => request('GET', `/sites/${enc(cbid)}/consent/export${qs(toQuery(query))}`, undefined, true) as Promise<string>,
      receipt: (cbid, stamp) => get(`/sites/${enc(cbid)}/receipt/${enc(stamp)}`) as Promise<SignedReceipt>,
      eraseSubject: (cbid, stamp) =>
        request('POST', `/sites/${enc(cbid)}/erase-consent`, { stamp }) as Promise<{ erased: number }>,
      exportSubject: (cbid, stamp) =>
        request('GET', `/sites/${enc(cbid)}/subject-export?stamp=${enc(stamp)}`) as Promise<{ cbid: string; stamp: string; records: unknown[]; count: number }>,
      categoryRegistry: () => get('/categories/registry') as Promise<CategoryRegistry>,
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
      advance: (id, toStatus, opts) =>
        request('POST', `/dsar/${enc(id)}/advance`, { toStatus, ...(opts?.messageToSubject !== undefined ? { messageToSubject: opts.messageToSubject } : {}) }) as Promise<{ request: DsarRequest }>,
      response: (id) => request('GET', `/dsar/${enc(id)}/response`, undefined, true) as Promise<string>,
      erase: (id, cbid, stamp) => request('POST', `/dsar/${enc(id)}/erase`, { cbid, stamp }) as Promise<DsarEraseResult>,
      export: (id, cbid, stamp) => request('POST', `/dsar/${enc(id)}/export`, { cbid, stamp }) as Promise<DsarExportResult>,
      delete: async (id) => {
        await request('DELETE', `/dsar/${enc(id)}`);
      },
      markTest: (id) => request('POST', `/dsar/${enc(id)}/mark-test`) as Promise<{ request: DsarRequest; changed: boolean }>,
      listByTrace: (trace) => get(`/dsar${qs({ trace })}`) as Promise<DsarRequest[]>,
      openCase: (input, o) =>
        request('POST', '/dsar/requests', input, false, {
          ...(o?.idempotencyKey ? { 'Idempotency-Key': o.idempotencyKey } : {}),
          ...(o?.trace ? { 'X-ForgeDeck-Trace': o.trace } : {}),
        }) as Promise<DsarCase>,
      getCase: (id) => get(`/dsar/requests/${enc(id)}`) as Promise<DsarCase>,
      cancelCase: (id) => request('POST', `/dsar/requests/${enc(id)}/cancel`) as Promise<DsarCase>,
      caseReceipt: (id) => get(`/dsar/requests/${enc(id)}/receipt`) as Promise<DsarCaseReceipt>,
      caseReceiptPdf: (id) => requestBytes(`/dsar/requests/${enc(id)}/receipt?format=pdf`),
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
    rightsPage: {
      get: (cbid) => get(`/sites/${enc(cbid)}/rights-page`) as Promise<RightsPageDraft>,
      put: (cbid, page, opts) => request('PUT', `/sites/${enc(cbid)}/rights-page`, withBase(page, opts)) as Promise<RightsPageDraft>,
      patch: (cbid, patch, opts) => request('PATCH', `/sites/${enc(cbid)}/rights-page`, withBase(patch, opts)) as Promise<RightsPageDraft>,
      dryRun: (cbid, page, opts) =>
        request(opts?.mode === 'put' ? 'PUT' : 'PATCH', `/sites/${enc(cbid)}/rights-page?dryRun=1`, page) as Promise<RightsPageDryRun>,
      getPublished: (cbid) => get(`/sites/${enc(cbid)}/rights-page/published`) as Promise<RightsPagePublished>,
      publish: (cbid, opts) => request('POST', `/sites/${enc(cbid)}/rights-page/publish`, withBase({}, opts)) as Promise<RightsPagePublishResult>,
      versions: (cbid) => get(`/sites/${enc(cbid)}/rights-page/versions`) as Promise<RightsPageVersions>,
      rollback: (cbid, version, opts) => request('POST', `/sites/${enc(cbid)}/rights-page/rollback`, withBase({ version }, opts)) as Promise<RightsPagePublishResult>,
      listDomains: (cbid) => get(`/sites/${enc(cbid)}/rights-page/domains`) as Promise<RightsPageDomainList>,
      addDomain: (cbid, hostname) => request('POST', `/sites/${enc(cbid)}/rights-page/domains`, { hostname }) as Promise<RightsPageDomain>,
      verifyDomain: (cbid, hostname) =>
        request('POST', `/sites/${enc(cbid)}/rights-page/domains/${enc(hostname)}/verify`) as Promise<RightsPageDomain>,
      removeDomain: async (cbid, hostname) => {
        await request('DELETE', `/sites/${enc(cbid)}/rights-page/domains/${enc(hostname)}`);
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
      executors: (o) => get(`/dsar/executors${metaQs(o)}`) as Promise<DsarExecutor[]>,
      executor: (id) => get(`/dsar/executors/${enc(id)}`) as Promise<DsarExecutor>,
      connectExecutor: (input) => request('POST', '/dsar/executors', input) as Promise<DsarExecutorCreated>,
      updateExecutor: (id, patch) => request('PATCH', `/dsar/executors/${enc(id)}`, patch) as Promise<DsarExecutor>,
      dryRunConnectExecutor: (input) => request('POST', '/dsar/executors?dryRun=1', input) as Promise<DsarExecutorDryRun>,
      executorPresets: () => get('/dsar/executors/presets') as Promise<ExecutorPresets>,
      upgradeExecutorPreset: (id, input = {}) =>
        request('POST', `/dsar/executors/${enc(id)}/upgrade-preset`, input) as Promise<DsarExecutor & { diff: ConfigChange[] }>,
      dryRunUpgradeExecutorPreset: (id, input = {}) =>
        request('POST', `/dsar/executors/${enc(id)}/upgrade-preset?dryRun=1`, input) as Promise<DsarExecutorDryRun>,
      dryRunUpdateExecutor: (id, patch) => request('PATCH', `/dsar/executors/${enc(id)}?dryRun=1`, patch) as Promise<DsarExecutorDryRun>,
      testExecutorWebhook: (id, delivery) =>
        request('POST', `/dsar/executors/${enc(id)}/webhook/test`, delivery) as Promise<ExecutorWebhookTestResult>,
      executorWebhookDeliveries: (id) => get(`/dsar/executors/${enc(id)}/webhook/deliveries`) as Promise<ExecutorWebhookDelivery[]>,
      disconnectExecutor: async (id) => {
        await request('DELETE', `/dsar/executors/${enc(id)}`);
      },
      taskExport: (requestId, taskId) => get(`/dsar/${enc(requestId)}/tasks/${enc(taskId)}/export`) as Promise<DsarTaskExport>,
      task: (requestId, taskId) => get(`/dsar/${enc(requestId)}/tasks/${enc(taskId)}`) as Promise<DsarTask>,
      testExecutor: (id, input) => request('POST', `/dsar/executors/${enc(id)}/test`, input) as Promise<ExecutorTestResult>,
      recheckExecutor: (id) => request('POST', `/dsar/executors/${enc(id)}/recheck`) as Promise<ExecutorTestResult>,
      executorHealthHistory: (id, opts = {}) =>
        get(`/dsar/executors/${enc(id)}/health/history${qs({ limit: opts.limit })}`) as Promise<ExecutorHealth[]>,
      executorConformance: (id) => request('POST', `/dsar/executors/${enc(id)}/test`, { conformance: true }) as Promise<ExecutorConformanceResult>,
      rollExecutorCompletionSecret: (id) => request('POST', `/dsar/executors/${enc(id)}/completion-secret/roll`) as Promise<CompletionSecretRolled>,
    },
    preferences: {
      list: () => get('/preferences') as Promise<PreferenceItem[]>,
      save: (subjectId, purposes) => request('POST', '/preferences', { subjectId, purposes }) as Promise<{ record: PreferenceRecord }>,
      get: (subjectId) => get(`/preferences/${enc(subjectId)}`) as Promise<PreferenceRecord>,
    },
    preferenceCenter: {
      mintToken: (input) => request('POST', '/preference-center/tokens', input) as Promise<CenterToken>,
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
      report: (o) => get(`/keys/report${qs({ unusedDays: o?.unusedDays, expiringDays: o?.expiringDays })}`) as Promise<ApiKeyReport>,
      listStandard: () => get('/keys?shape=standard') as Promise<StandardKeyList>,
      self: () => get('/keys/self') as Promise<ApiKeyPrefix>,
      rollSelf: () => request('POST', '/keys/self/roll') as Promise<ApiKeyIssued>,
      vend: (input) => request('POST', '/keys/vend', input) as Promise<ApiKeyVended>,
      revokeLeaked: (report) => request('POST', '/keys/revoke_leaked', report) as Promise<{ received: number }>,
    },
    usage: () => get('/usage') as Promise<Usage>,
    entitlements: () => get('/entitlements') as Promise<Entitlements>,
    integrationHealth: (cbid) => get(`/integration-health${qs({ cbid })}`) as Promise<IntegrationHealthReport>,
    healthWaivers: {
      list: (cbid) => get(`/integration-health/waivers${qs({ cbid })}`) as Promise<{ cbid: string; waivers: HealthWaiver[] }>,
      set: (input) => request('PUT', '/integration-health/waivers', input) as Promise<{ waiver: HealthWaiver }>,
      remove: async (check, opts) => {
        await request('DELETE', `/integration-health/waivers${qs({ check, cbid: opts?.cbid, subject: opts?.subject })}`);
      },
    },
    embedManifest: (cbid) => get(`/embed${qs({ cbid })}`) as Promise<EmbedManifest>,
    provision: (input, o) => request('POST', `/provision${qs({ dryRun: o?.dryRun ? '1' : undefined, fromStep: o?.fromStep })}`, input) as Promise<ProvisionResult>,
    org: {
      get: () => get('/org') as Promise<Org>,
      update: (patch) => request('PATCH', '/org', patch) as Promise<Org>,
      mailProvider: {
        get: () => get('/org/mail-provider') as Promise<MailProvider>,
        set: (input) => request('PUT', '/org/mail-provider', input) as Promise<MailProvider>,
        remove: async () => {
          await request('DELETE', '/org/mail-provider');
        },
        test: (to) => request('POST', '/org/mail-provider/test', to ? { to } : {}) as Promise<MailProviderTestResult>,
      },
      controller: {
        get: () => get('/org/controller') as Promise<OrgControllerIdentity>,
        set: (input) => request('PUT', '/org/controller', input) as Promise<OrgControllerIdentity>,
        remove: async () => {
          await request('DELETE', '/org/controller');
        },
      },
      rightsCaptcha: {
        get: () => get('/org/rights-captcha') as Promise<RightsCaptcha>,
        set: (input) => request('PUT', '/org/rights-captcha', input) as Promise<RightsCaptcha>,
        remove: () => request('DELETE', '/org/rights-captcha') as Promise<RightsCaptcha>,
      },
      rightsIdentity: {
        get: () => get('/org/rights-identity') as Promise<RightsIdentity>,
        set: (input) => request('PUT', '/org/rights-identity', input) as Promise<RightsIdentity>,
        remove: () => request('DELETE', '/org/rights-identity') as Promise<RightsIdentity>,
      },
    },
    audit: (limit, opts) => get(`/audit${qs({ limit, actor: opts?.actor })}`) as Promise<{ entries: AuditEntry[] }>,
    auditSink: {
      get: () => get('/audit/sink') as Promise<{ sink: AuditSink }>,
      set: (input) => request('PUT', '/audit/sink', input) as Promise<{ sink: AuditSink; secret?: string }>,
      remove: async () => {
        await request('DELETE', '/audit/sink');
      },
    },
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
      list: (o) => get(`/webhooks${metaQs(o)}`) as Promise<WebhookSubscription[]>,
      create: (input) => request('POST', '/webhooks', input) as Promise<WebhookSubscription>,
      update: (id, patch) => request('PATCH', `/webhooks/${enc(id)}`, patch) as Promise<WebhookSubscription>,
      delete: async (id) => {
        await request('DELETE', `/webhooks/${enc(id)}`);
      },
      rollSecret: (id) => request('POST', `/webhooks/${enc(id)}/roll`) as Promise<{ secret: string }>,
      test: (id) => request('POST', `/webhooks/${enc(id)}/test`) as Promise<WebhookTestResult>,
      deadLetters: () => get('/webhooks/dead-letters') as Promise<{ deadLetters: WebhookDeadLetter[] }>,
      replayDeadLetter: (id) => request('POST', `/webhooks/dead-letters/${enc(id)}/replay`),
      replay: (id, since, opts) => request('POST', `/webhooks/${enc(id)}/replay${qs({ since: String(since), limit: opts?.limit })}`) as Promise<WebhookReplayResult>,
    },
    rightsLinks: {
      create: (cbid, input) => request('POST', `/sites/${enc(cbid)}/rights-links`, input) as Promise<RightsLink>,
    },
    consentSyncSecret: {
      get: (cbid) => get(`/sites/${enc(cbid)}/consent-sync-secret`) as Promise<ConsentSyncSecret>,
      rotate: (cbid) => request('POST', `/sites/${enc(cbid)}/consent-sync-secret`) as Promise<ConsentSyncSecretMinted>,
      remove: (cbid) => request('DELETE', `/sites/${enc(cbid)}/consent-sync-secret`) as Promise<ConsentSyncSecret>,
    },
    rightsCaptcha: {
      get: (cbid) => get(`/sites/${enc(cbid)}/rights-captcha`) as Promise<RightsCaptcha>,
      set: (cbid, input) => request('PUT', `/sites/${enc(cbid)}/rights-captcha`, input) as Promise<RightsCaptcha>,
      remove: (cbid) => request('DELETE', `/sites/${enc(cbid)}/rights-captcha`) as Promise<RightsCaptcha>,
    },
    rightsIdentity: {
      get: (cbid) => get(`/sites/${enc(cbid)}/rights-identity`) as Promise<RightsIdentity>,
      set: (cbid, input) => request('PUT', `/sites/${enc(cbid)}/rights-identity`, input) as Promise<RightsIdentity>,
      remove: (cbid) => request('DELETE', `/sites/${enc(cbid)}/rights-identity`) as Promise<RightsIdentity>,
    },
    dsarSettings: {
      get: (cbid) => get(`/sites/${enc(cbid)}/dsar-settings`) as Promise<DsarSettings>,
      set: (cbid, input) => request('PUT', `/sites/${enc(cbid)}/dsar-settings`, input) as Promise<DsarSettings>,
    },
    integrations: {
      subjectCard: (app, person) => get(`/integrations/${enc(app)}/card${qs(person as Record<string, string>)}`) as Promise<SubjectCard>,
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
