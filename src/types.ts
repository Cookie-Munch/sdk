/**
 * Request/response shapes for the Cookie Munch Developer API (/v1). These mirror the
 * server's dev-api surface; they are defined here (rather than imported) so the SDK
 * has no runtime/workspace dependency on the server package.
 */

export interface Identity {
  orgId: string;
  orgName?: string | null;
  /** The EFFECTIVE plan — the one every feature gate and limit uses. */
  plan: string;
  /**
   * Why: `org` = this org's own subscription (or free, or a reseller-managed `child` plan);
   * `account` = another org with the same owner pays for a higher plan that covers this one.
   */
  planSource: PlanSource;
  /** What this org subscribes to itself (`free` = no subscription of its own). */
  subscribedPlan: string;
  /** Features the effective plan unlocks (e.g. `whiteLabel`, `tcf`, `sso`, `abTesting`). */
  features: string[];
  keyPrefix: string;
  /** null = full access. */
  scopes?: string[] | null;
  unscoped?: boolean;
  propertyLocked?: boolean;
  cbids?: string[];
  reseller?: boolean;
  /** This organisation is a sandbox (`sandbox.create()`): test keys, test rights requests, never billed. */
  sandbox?: boolean;
  /** For a sandbox: the live organisation it belongs to. */
  sandboxOf?: string;
}

export type PlanSource = 'org' | 'account';

/** One organisation on an account (GET /v1/orgs, and the `org_limit` refusal). */
export interface AccountOrg {
  id: string;
  name: string;
  /** The effective plan. */
  plan: string;
  planSource: PlanSource;
  subscribedPlan: string;
  /** Present on a reseller-managed child organisation. */
  parentOrgId?: string;
  createdAt: number;
  /** True for the organisation the calling key belongs to. */
  current: boolean;
}

export interface AccountOrgs {
  orgs: AccountOrg[];
  /** The per-account org cap: `max` (null = unlimited), the `plan` that sets it, and `used`. */
  orgLimit: { max: number | null; plan: string; used: number };
  /** The dashboard billing page, where a plan is chosen. */
  upgradeUrl: string;
}

export interface Site {
  cbid: string;
  orgId: string;
  domain: string;
  /** The business name data subjects see on the rights page, in notices and the policy. Absent: the domain is shown. */
  name?: string;
  /** Other hosts serving the site: accepted consent-ingest origins, never verified claims. */
  aliases?: string[];
  verified?: boolean;
  /** Epoch ms of the last embed beacon from the domain or an alias, accurate to the hour. null/absent: none yet. */
  lastSeenAt?: number | null;
}

/** PATCH /v1/sites/{cbid} — rename or move a site. `name: null` clears the name; `aliases: []` clears them. */
export interface SiteUpdate {
  domain?: string;
  name?: string | null;
  aliases?: string[];
  /** With a new domain: keep the old one as an alias, so consent is still accepted there while both run. Remove it from aliases when the move is done. */
  keepOldDomain?: boolean;
}

/** The site's own fields at the top (as `sites.get` returns them, `aliases` always an array), plus `site`, `diff` and `effects`. */
export interface SiteUpdateResult extends Site {
  aliases: string[];
  dryRun?: true;
  site: Site;
  diff: Array<{ field: 'domain' | 'name' | 'aliases' | 'verified'; before: unknown; after: unknown }>;
  effects: {
    /** `reset`: the domain moved; verify the new one. */
    verification: 'kept' | 'reset';
    scanTarget: string;
    previewDefaultUrl: string;
    displayName: string;
    /** Custom rights-page hostnames no longer under the domain or an alias (left in place). */
    staleRightsDomains: string[];
  };
  warnings?: Array<{ field: string; reason: string }>;
}

/** One row of GET /v1/integration-health. `ok: null` = the check could not run (see `detail`). */
export interface HealthRow {
  /** The suite shape's name for `check` (always equal). */
  id: string;
  check: string;
  /** The generic check this row is an instance of (`forumulate.webhook` → `webhook.delivery`); otherwise `check`. */
  kind: string;
  /** The vendor a vendor-specific instance is about. */
  vendor?: string;
  ok: boolean | null;
  severity: 'error' | 'warning' | 'info';
  subject: string;
  fixHint?: string;
  /** The same as fixHint (suite shape). */
  fix?: string;
  /** Where the check and its fix are explained. */
  docs: string;
  detail?: string;
  /** Network checks: the hop that failed (or, on success, the last one reached). */
  hop?: 'dns' | 'tls' | 'http' | 'challenge' | 'auth';
  status?: number;
  elapsedMs?: number;
  /** Failed network checks: a stable code (ENOTFOUND, timeout, challenge, http_503, …). */
  error?: string;
  /** A waiver covers this failing row; `ok` is then null. */
  waived?: { reason: string; by: string; until: number | null };
  lastCheckedAt: number;
}
export interface IntegrationHealthReport {
  cbid: string;
  checkedAt: number;
  generatedAt: string;
  ok: boolean;
  counts: { error: number; warning: number; notChecked: number; waived: number };
  checks: HealthRow[];
}
/** PUT /v1/integration-health/waivers. */
export interface HealthWaiverInput {
  /** Optional when the organisation has one site. */
  cbid?: string;
  /** A row's `check` or `kind`. */
  check: string;
  /** A row's `subject`; omitted: every subject of the check (`*`). */
  subject?: string;
  /** Why this is deliberate (1–500 characters). */
  reason: string;
  /** ISO date or epoch ms, future, within a year; omitted or null: never expires. */
  until?: string | number | null;
}
export interface HealthWaiver {
  cbid: string;
  check: string;
  subject: string;
  reason: string;
  by: string;
  until: number | null;
  createdAt: number;
  expired?: boolean;
}

/** POST /v1/provision. Secrets are used for the request only and never returned. */
export interface ProvisionRequest {
  product: string;
  domain: string;
  name?: string;
  aliases?: string[];
  cbid?: string;
  /** `frontendApiHost` (e.g. auth.example.com) lets provision declare Atlas's sign-in cookies on the site. */
  /** `rightsIdentity` (default true) makes Atlas the site's rights sign-in (step `rights.identity`). */
  atlas?: { secretKey: string; cookieConsent?: boolean; dsrWebhook?: boolean; rightsIdentity?: boolean; frontendApiHost?: string; connect?: boolean };
  forumulate?: { token: string; orgId: string; consent?: boolean; executorKey?: boolean; label?: string };
  rightsApi?: { baseUrl: string; secretKey: string; profilePreset?: string };
}
export interface ProvisionStep {
  /** v2 answers: the stable step id (`fromStep` takes it). */
  id?: string;
  step: string;
  status: 'created' | 'updated' | 'unchanged' | 'would_create' | 'would_update' | 'skipped' | 'waiting' | 'waiting_on' | 'failed' | 'passed';
  detail?: string;
  diff?: Array<{ field: string; before: unknown; after: unknown }>;
  /** A string in v1 answers; `{ platform, items }` in v2 answers. */
  waitingOn?: string | { platform: string; items: string[] };
}
export interface ProvisionResult {
  dryRun: boolean;
  product: string;
  cbid: string | null;
  steps: ProvisionStep[];
  summary: { changed: number; unchanged: number; waiting: number; failed: number };
  /** v2 answers only. */
  version?: 2;
  ids?: { orgId: string; cbid: string | null; executors: Record<string, string>; webhooks: string[] };
  sealedSecrets?: Array<Record<string, unknown>>;
  checklist?: string[];
}

/** A partner the deployment knows: built in (forumulate, atlas, chatly, referalli) or any other registered on it. */
export type PartnerId = 'forumulate' | 'atlas' | 'chatly' | 'referalli' | (string & {});
export interface PartnerLinkCreate {
  partner: PartnerId;
  /** The partner's id for the receiving account (a Forumulate organisation id, an Atlas instance id). */
  externalId: string;
  label?: string;
  events?: Array<'consent.recorded' | 'consent.withdrawn'>;
}
export interface PartnerLink {
  id: string;
  cbid: string;
  partner: PartnerId;
  externalId: string;
  label?: string;
  events: string[];
  status: 'active' | 'waiting_on_partner' | 'revoked';
  /** e.g. "Forumulate (docs) — receiving consent events". */
  summary: string;
  waitingOn?: string;
  createdAt: number;
  createdBy?: string;
  revokedAt?: number;
  revokedBy?: string | null;
  lastDeliveryAt: number | null;
  lastError: string | null;
}
export interface PartnerCatalogEntry { id: PartnerId; label: string; externalIdLabel: string; events: string[]; available: boolean; waitingOn?: string }

export interface SiteCreate {
  domain: string;
  /** Optional; the server auto-generates a cbid when omitted. */
  cbid?: string;
}

/** Site config is an open, deeply-nested object owned by @cookiemunch/core. */
export type SiteConfig = Record<string, unknown>;

export interface ConsentDay {
  Date: string;
  OptIn: number;
  OptOut: number;
  OptInImplied: number;
  OptInStrict: number;
  TypeOptInPref: number;
  TypeOptInStat: number;
  TypeOptInMark: number;
  Impressions: number;
  Countries: Record<string, number>;
}

export interface ConsentLogRow {
  stamp: string;
  receivedAt: number;
  region: string;
  method: string;
  choices: { preferences: boolean; statistics: boolean; marketing: boolean };
  anonIp: string;
  url: string;
}

export interface RangeQuery {
  from?: number;
  to?: number;
}

export interface LogQuery extends RangeQuery {
  limit?: number;
}

export type DsarType = 'access' | 'deletion' | 'rectification' | 'portability' | 'opt-out' | 'closure' | 'restriction';
/** A type word as sent: the canonical words, or an alias (`erasure`/`erase` → deletion, `export` → access). */
export type DsarTypeWord = DsarType | 'erasure' | 'erase' | 'export';
export type Regulation = 'gdpr' | 'ccpa';
export type DsarStatus = 'received' | 'verifying' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';

export interface DsarRequest {
  id: string;
  type: DsarType;
  subjectEmail: string;
  regulation: Regulation;
  status: DsarStatus;
  createdAt: number;
  dueAt: number;
  /** Where the subject said they are, when the intake captured it. */
  jurisdiction?: string;
  /** INTERNAL: intake note plus the audit lines `/erase` and `/export` append. Never shown to the subject. */
  note?: string;
  /** The line the subject reads in the response notice. */
  messageToSubject?: string;
  /** A test request: off the SLA board, labelled, and deletable with `dsar.delete`. A closed request can be marked one with `dsar.markTest`. */
  test?: boolean;
  /** Its type in the suite vocabulary (`erasure` was stored as `deletion`). */
  canonicalType?: string;
  /** The case's X-Trace-Id, when it has one. */
  trace?: string;
  /** Filed at a processor site: the controller it goes to and how the forward went. */
  processor?: DsarProcessorForward;
}

/** A processor site's request on its way to the controller (dsar-settings `processing`). */
export interface DsarProcessorForward {
  controllerId: string;
  controllerName: string;
  attempts: number;
  lastAttemptAt?: number;
  /** Why the last forward failed; the request stays in_progress and is retried. */
  lastError?: string;
  /** The retries are spent: a person must act. The request is still open. */
  needsPerson?: boolean;
  outcome?: 'processor_forwarded' | 'processor_referred';
  forwardedTo?: { controllerId: string; name: string; kind: 'cookiemunch' | 'webhook' | 'refer'; at: number; caseId?: string; contactUrl?: string; contactEmail?: string };
}

/** A business a processor site handles data for, and how its requests reach it. */
export interface ProcessorController {
  id: string;
  name: string;
  contactUrl?: string;
  contactEmail?: string;
  /** cookiemunch: open a case on that site (it must list you in acceptForwardsFrom). webhook: POST dsar.forwarded, signed. refer: send nothing. */
  forward:
    | { kind: 'cookiemunch'; cbid: string }
    /** `secret` is write-only; it reads back as `hasSecret`. */
    | { kind: 'webhook'; url: string; secret?: string; hasSecret?: boolean }
    | { kind: 'refer' };
}

/** A signed-in identity from any OIDC issuer the site trusts. `(iss, sub)` is the key. */
export interface SubjectIdentity {
  iss: string;
  sub: string;
  ext?: string;
  principal?: string;
}

/** Who a case is about. `atlas` is accepted as an alias of `identity`. */
export interface DsarSubject {
  emails: string[];
  identity?: SubjectIdentity;
  atlas?: SubjectIdentity;
}

/** POST /v1/dsar/requests. */
export interface DsarCaseCreate {
  cbid: string;
  type: DsarTypeWord;
  subject?: DsarSubject;
  /** The person's own token from the site's sign-in issuer (aud `cookiemunch:<cbid>`). */
  subjectToken?: string;
  /** product and atlas need dsar:write and attest the person; admin (default) files it received. */
  /** `identity`: the site's sign-in provider. `atlas` is its former name. */
  source?: 'product' | 'identity' | 'admin' | 'atlas';
  /** The person deleted their own account. Default for a closure from product or identity. (`processor_forward` is set by Cookie Munch only.) */
  origin?: 'account_deletion';
  reason?: string;
  /** Connections not to ask: system names, connection ids, or `self`. */
  skipSystems?: string[];
  /** No notice to the person: for whoever sends notices off this case and its webhooks. */
  silent?: boolean;
  /** Every erasure waits for a person's approval, task by task. */
  legalHold?: boolean;
  /** Answers the real plan with read-only lookups. Files nothing. */
  simulate?: boolean;
  /** Default true. */
  fulfill?: boolean;
  regulation?: 'gdpr' | 'ccpa' | 'lgpd' | 'pipeda' | 'vcdpa';
  jurisdiction?: string;
  test?: boolean;
  /** On a processor site: the id of the controller this concerns. Optional when the site lists one. */
  controller?: string;
}

export type DsarCaseStatus = 'pending' | 'scheduled' | 'processing' | 'completed' | 'completed_with_retention' | 'rejected' | 'cancelled';

export interface RetentionLine {
  category: string;
  basis: 'legal_obligation' | 'legal_claims' | 'contract' | 'public_interest' | 'legitimate_interest';
  until?: string;
}

export interface DsarCaseTask {
  system: string;
  executorId: string | null;
  taskId: string;
  status: DsarCaseStatus | 'no_match';
  requestId: string | null;
  eta: string | null;
  completedAt: string | null;
  detail: string | null;
  retention?: RetentionLine[];
  /** Present while this erasure waits for `approveTask` / `rejectTask` (status reads pending). */
  awaitingApproval?: true;
  /** What the system said the erasure would remove. */
  preview?: { at: number; text?: string; error?: string };
  /** This row's own account at that system, when one email matched several. */
  subjectId?: string;
}

/** A case across every connected system. */
export interface DsarCase {
  id: string;
  type: DsarType;
  canonicalType: string;
  status: DsarCaseStatus;
  requestStatus: DsarStatus;
  cbid?: string;
  source: 'product' | 'identity' | 'rights_page' | 'admin' | 'atlas' | null;
  /** account_deletion: the person deleted their own account. processor_forward: a processor passed it on to you (see forwardedFrom). */
  origin: 'account_deletion' | 'processor_forward' | null;
  reason: string | null;
  openedAt: string;
  /** Nothing is erased anywhere before this. */
  executeAfter: string | null;
  graceDays: number | null;
  closedAt: string | null;
  /** False for a closure: no statutory clock. */
  statutory: boolean;
  dueAt: string | null;
  verification: string | null;
  trace: string | null;
  subject: { emails: string[]; identity: SubjectIdentity | null };
  skipSystems: string[];
  silent?: boolean;
  legalHold?: boolean;
  fulfill: boolean | null;
  cancelRequestedAt: string | null;
  test: boolean;
  /** Filed at a processor site: the controller it goes to and how the forward went. */
  processor: DsarProcessorForward | null;
  /** origin processor_forward: the processor that passed it on. */
  forwardedFrom: { orgId: string; name: string; cbid: string; caseId: string } | null;
  tasks: DsarCaseTask[];
  receiptUrl: string;
  /** Lets the person who asked read this case through POST /api/v1/public/dsar/status. */
  statusToken?: string;
}

/** One signed receipt for a case (Ed25519; verify with GET /v1/partner/jwks.json). */
export interface DsarCaseReceipt {
  receiptVersion: number;
  caseId: string;
  type: DsarType;
  canonicalType: string;
  status: DsarCaseStatus;
  openedAt: string;
  executeAfter: string | null;
  closedAt: string | null;
  verification: string | null;
  trace: string | null;
  subject: { emailHashes: string[]; identityHash?: string; atlasSubHash?: string };
  systems: Array<{ system: string; executorId: string | null; requestId: string | null; status: string; completedAt: string | null; trace: string | null; retention?: RetentionLine[] }>;
  issuedAt: string;
  signature: { alg: 'Ed25519'; kid: string; value: string; covers?: string };
}

/** A site's rights-request settings. */
export interface DsarSettings {
  cbid: string;
  /** Days an erasure or account closure waits before any system acts (0–30). 7 for a new site; 0 for one that existed before (opt-in). */
  graceDays: number;
  /** site: set explicitly; default: a new site's 7 days; legacy: an existing site, 0 until set. */
  source: 'site' | 'default' | 'legacy';
  updatedAt: number | null;
  /** Set when this site is a processor: its requests go to the controller they concern, not your connected systems. */
  processing: { role: 'processor'; controllers: ProcessorController[] } | null;
  /** On a controller's site: the processors (org ids or cbids) that may open cases here. */
  acceptForwardsFrom: string[];
}

/** PUT /v1/sites/{cbid}/dsar-settings: only the fields sent change; null clears. */
export interface DsarSettingsInput {
  graceDays?: number;
  processing?: { role: 'processor'; controllers: ProcessorController[] } | null;
  acceptForwardsFrom?: string[] | null;
}

/** GET /v1/integrations/{app}/card. */
export interface SubjectCard {
  app: string;
  openCases: Array<{ id: string; type: string; status: string; executeAfter: string | null; openedAt: string; receiptUrl: string }>;
  consent: null;
}

/** POST /v1/integrations/{provider}/connect. */
export interface IntegrationConnect {
  /** The site the provider opens cases on. */
  cbid: string;
  /** The provider instance's secret key (Forumulate: an org token, fck_…), used for this one call; never stored or echoed. */
  providerKey: string;
  /** Forumulate only (required there): the Forumulate organisation whose consent follows the site. */
  orgId?: string;
  /** Only for a provider with no built-in connector. A body value "{apiKey}" becomes the minted key. */
  connector?: { url: string; method?: 'PUT' | 'POST'; body: Record<string, unknown> };
  /**
   * Atlas: also create (or update) the `atlas` connection, holding the narrow key Atlas mints for it and
   * the `whsec_` secret of the completion webhook Atlas points at its `webhookUrl`. Forumulate: also mint
   * Forumulate's executor key into the `forumulate` connection. Needs a key not locked to properties.
   */
  executor?: boolean;
}

export interface IntegrationConnectResult {
  connected?: boolean;
  dryRun?: true;
  provider: string;
  cbid: string;
  /** Forumulate: the Forumulate organisation. */
  orgId?: string;
  /** The minted key's metadata; the key itself is never returned. Not for Forumulate, which mints no key. */
  key?: { prefix?: string; name: string; owner: string; scopes: string[]; cbids: string[]; expiresAt?: number | null; expiresInDays?: number };
  request?: { method: 'PUT' | 'POST'; url: string; status?: number };
  /** Forumulate: the provision steps run, as POST /v1/provision answers them. */
  steps?: Array<{ step: string; status: string; detail?: string; waitingOn?: string }>;
  summary?: Record<'changed' | 'unchanged' | 'waiting' | 'failed', number>;
  trace?: string;
  /** Only on a dry run: the body that would be sent, the key shown as a placeholder. */
  requestBody?: Record<string, unknown>;
  /** Earlier keys for this provider and site, revoked now. */
  revoked?: string[];
  wouldRevoke?: string[];
  /** With `executor: true`: the `atlas` (or `forumulate`) connection (answer 207 when it could not be stored). */
  executor?: {
    status: 'created' | 'updated' | 'unchanged' | 'failed' | 'would_create' | 'would_update' | 'skipped' | 'waiting';
    id?: string | null;
    system?: string;
    webhookUrl?: string;
    hasWebhookSecret?: boolean;
    error?: string;
  };
}

/**
 * How a rights-page requester was verified — on every answer of the public intake
 * (`POST /api/v1/public/dsar`, `/verify`, `/resend`) and so in the `dsar.created` webhook payload.
 * `email_code` on a 202: a code was mailed through your own provider; on a 201: the code matched.
 * `none` with a `reason`: filed without verification — confirm the requester yourself. `none`
 * without one: an opt-out, which needs no verification.
 */
export type PublicVerification =
  | { method: 'session' | 'email_code' | 'account_link' }
  | { method: 'none'; reason?: 'no_verification_configured' | 'mail_failed' | 'recipient_rejected' };

/** A public intake that filed a request (201): also the `dsar.created` payload for one. */
export interface PublicDsarFiled {
  id: string;
  status: 'received' | 'verifying';
  /** Epoch ms the statutory response is due. */
  deadline: number;
  /** Only when filed without verification; the same as `verification.method` `none` with a `reason`. */
  unverified?: true;
  verification: PublicVerification;
}

/** A public intake waiting for its email code (202). */
export interface PublicDsarPending {
  pendingId: string;
  expiresAt: number;
  resendAfter?: number;
  verification: { method: 'email_code' };
}

export interface DsarCreate {
  type: DsarType;
  subjectEmail: string;
  /** Picks the statutory response window. */
  regulation: Regulation;
  /**
   * Where the subject says they are (ISO 3166 country or country-subdivision, e.g.
   * `US-TX`). The response notice names the statute that governs there — without it a
   * Texan is told their request was handled under a Virginia law, since every US state
   * shares one `regulation` for the deadline.
   */
  jurisdiction?: string;
  /** INTERNAL: kept on the request, never shown to the subject. */
  note?: string;
  /** The one free-text line the subject reads in the notice (≤2000 chars; an API key or key prefix is refused). */
  messageToSubject?: string;
  /** The property this request belongs to; decides which connected systems answer it. */
  cbid?: string;
  /** The subject's consent-receipt id. */
  stamp?: string;
  /**
   * Mark it as a test: left out of SLA metrics and the deadline board, labelled as a test,
   * and deletable with `dsar.delete(id)`. For end-to-end checks of a rights flow.
   */
  test?: boolean;
  /** On a processor site: the id of the controller this concerns. Optional when the site lists one. */
  controller?: string;
}

export interface VendorInput {
  name: string;
  category: string;
  dataShared: string[];
  dpaSigned: boolean;
  subprocessors: number;
  certifications: string[];
  region: string;
}

export interface RiskScore {
  score: number;
  band: 'low' | 'medium' | 'high';
}

/** A stored vendor record (no computed risk; see {@link ScoredVendor}). Returned as the
 *  `vendor` field of POST /v1/vendors. */
export interface VendorRecord extends VendorInput {
  id: string;
}

/** A vendor as listed, with its computed risk flattened in. */
export interface ScoredVendor extends VendorRecord {
  risk: RiskScore;
}

export type LegalBasis =
  | 'consent'
  | 'contract'
  | 'legal-obligation'
  | 'vital-interests'
  | 'public-task'
  | 'legitimate-interests';

export interface RopaInput {
  name: string;
  purpose: string;
  legalBasis: LegalBasis;
  dataCategories: string[];
  recipients: string[];
  retentionDays: number;
  crossBorderTransfer: boolean;
}

export interface RopaEntry extends RopaInput {
  id: string;
}

/** A signed consent receipt (shape owned by @cookiemunch/receipts). */
export type SignedReceipt = Record<string, unknown>;

/** How a preference-center opt-in was captured. Mirrors @cookiemunch/preferences OptInMethod. */
export type OptInMethod = 'single-opt-in' | 'double-opt-in';

/**
 * A subject's saved preference-center record (identity-keyed named purposes, distinct
 * from the org-level {@link PreferenceItem} catalog). Matches @cookiemunch/preferences
 * PreferenceRecord (mirrored here per this package's no-server-dependency convention).
 * Returned wrapped as `{ record }` by POST /v1/preferences.
 */
export interface PreferenceRecord {
  subjectId: string;
  purposes: Record<string, boolean>;
  method: OptInMethod;
  confirmed: boolean;
  updatedAt: number;
  version: number;
}

/** GET /v1/categories/registry — the reserved category templates (CMU-X15). */
export interface CategoryRegistry {
  version: 1;
  standard: string[];
  suite: Array<{
    id: 'support_chat' | 'referrals';
    stance: 'necessary_on_request' | 'opt_in_eu_uk';
    fallback: 'preferences' | 'marketing';
    /** By banner language. */
    labels: Record<string, string>;
    descriptions: Record<string, string>;
    basis?: string[];
    vendors?: Array<{ product: string; storage: string[] }>;
  }>;
}
