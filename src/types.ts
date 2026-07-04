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

/** A vendor as listed, with its computed risk flattened in. */
export interface ScoredVendor {
  id: string;
  name: string;
  category: string;
  dataShared: string[];
  dpaSigned: boolean;
  subprocessors: number;
  certifications: string[];
  region: string;
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
