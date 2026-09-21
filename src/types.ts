/**
 * Request/response shapes for the Cookie Munch Developer API (/v1). These mirror the
 * server's dev-api surface; they are defined here (rather than imported) so the SDK
 * has no runtime/workspace dependency on the server package.
 */

export interface Identity {
  orgId: string;
  plan: string;
  keyPrefix: string;
}

export interface Site {
  cbid: string;
  orgId: string;
  domain: string;
}

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

export type DsarType = 'access' | 'deletion' | 'rectification' | 'portability' | 'opt-out';
export type Regulation = 'gdpr' | 'ccpa';
export type DsarStatus = 'received' | 'verifying' | 'in_progress' | 'completed' | 'rejected';

export interface DsarRequest {
  id: string;
  type: DsarType;
  subjectEmail: string;
  regulation: Regulation;
  status: DsarStatus;
  createdAt: number;
  dueAt: number;
  note?: string;
}

export interface DsarCreate {
  type: DsarType;
  subjectEmail: string;
  regulation: Regulation;
  note?: string;
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
