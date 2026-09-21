/**
 * Server-side consent reading. The Cookie Munch embed stores the visitor's decision in a
 * first-party `CookieMunch` cookie (URL-encoded JSON). This lets a server / edge worker read
 * that decision from the incoming request — to gate server-rendered tags or SSR'd third-party
 * scripts BEFORE they hit the browser — without shipping the whole embed. Zero-dependency and
 * runtime-agnostic: accepts a raw Cookie header, a Node `req` (`req.headers.cookie`), or a
 * Fetch `Request` (`request.headers.get('cookie')`).
 *
 *   import { getConsent, isAllowed } from '@cookiemunch/sdk';
 *   const consent = getConsent(req);              // ServerConsent | null
 *   if (isAllowed(consent, 'statistics')) { …render analytics tag… }
 */

/** The first-party cookie the embed writes (mirrors @cookiemunch/core COOKIE_NAME). */
export const CONSENT_COOKIE_NAME = 'CookieMunch';

/** A visitor's consent decision, read from the request cookie. `necessary` is always true. */
export interface ServerConsent {
  necessary: true;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
  /** How consent was given. `implied` = not yet an explicit choice. */
  method: 'explicit' | 'implied';
  /** Custom (non-standard) categories, when the site defines any. */
  custom?: Record<string, boolean>;
  /** Region the decision was made in, and the receipt stamp, when present. */
  region?: string;
  stamp?: string;
}

/** Anything we can pull a Cookie header off of. */
export type ConsentSource =
  | string
  | null
  | undefined
  | { headers?: { cookie?: string | null; get?(name: string): string | null } | Record<string, unknown> };

function cookieHeaderOf(src: ConsentSource): string {
  if (typeof src === 'string') return src;
  if (!src || typeof src !== 'object') return '';
  const h = src.headers;
  if (!h) return '';
  // Fetch Request: headers.get('cookie'); Node: headers.cookie.
  if (typeof (h as { get?(n: string): string | null }).get === 'function') {
    return (h as { get(n: string): string | null }).get('cookie') ?? '';
  }
  const c = (h as Record<string, unknown>).cookie;
  return typeof c === 'string' ? c : '';
}

/** Extract one cookie's raw value from a Cookie header (no decoding). */
function cookieValue(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function bool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/** Parse a raw cookie value (URL-encoded JSON) into a validated ServerConsent, or null. */
export function parseConsentValue(raw: string): ServerConsent | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* not URL-encoded; use as-is */
  }
  let o: unknown;
  try {
    o = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (!bool(r.preferences) || !bool(r.statistics) || !bool(r.marketing)) return null;
  if (r.method !== 'explicit' && r.method !== 'implied') return null;
  const out: ServerConsent = {
    necessary: true, // never trust a cookie that claims necessary:false
    preferences: r.preferences,
    statistics: r.statistics,
    marketing: r.marketing,
    method: r.method,
  };
  if (typeof r.region === 'string') out.region = r.region;
  if (typeof r.stamp === 'string' || typeof r.stamp === 'number') out.stamp = String(r.stamp);
  if (r.custom && typeof r.custom === 'object' && !Array.isArray(r.custom)) {
    const custom: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(r.custom as Record<string, unknown>)) if (bool(v)) custom[k] = v;
    if (Object.keys(custom).length > 0) out.custom = custom;
  }
  return out;
}

/** Read the visitor's consent from a request (Cookie header / Node req / Fetch Request). */
export function getConsent(source: ConsentSource, cookieName: string = CONSENT_COOKIE_NAME): ServerConsent | null {
  const raw = cookieValue(cookieHeaderOf(source), cookieName);
  return raw ? parseConsentValue(raw) : null;
}

/** Standard + custom consent categories. */
export type ConsentCategory = 'necessary' | 'preferences' | 'statistics' | 'marketing' | (string & {});

/**
 * Whether a category is allowed for this visitor. `necessary` is always allowed. A missing
 * consent (`null` — visitor hasn't decided) is treated as NOT allowed for non-necessary
 * categories (fail-closed / prior-blocking posture), matching the embed.
 */
export function isAllowed(consent: ServerConsent | null, category: ConsentCategory): boolean {
  if (category === 'necessary') return true;
  if (!consent) return false;
  // Explicit per-literal access rather than `consent[category]`: the `(string & {})` arm of
  // ConsentCategory defeats control-flow narrowing, so a dynamic index is typed as an
  // implicit-any index into ServerConsent (TS7053, which fails the tsup DTS build).
  if (category === 'preferences') return consent.preferences === true;
  if (category === 'statistics') return consent.statistics === true;
  if (category === 'marketing') return consent.marketing === true;
  return consent.custom?.[category] === true;
}
