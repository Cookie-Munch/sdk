/**
 * Server-side consent reading. The Cookie Munch embed stores the visitor's decision in a
 * first-party `CookieMunch` cookie (URL-encoded JSON). This lets a server / edge worker read
 * that decision from the incoming request — to gate server-rendered tags or SSR'd third-party
 * scripts BEFORE they hit the browser — without shipping the whole embed. Zero-dependency and
 * runtime-agnostic: accepts a raw Cookie header, a Node `req` (`req.headers.cookie`), or a
 * Fetch `Request` (`request.headers.get('cookie')`).
 *
 *   import { readConsent, isAllowed } from '@cookiemunch/sdk/consent';
 *   const consent = readConsent(req.headers.cookie);   // ServerConsent | null
 *   if (isAllowed(consent, 'statistics')) { …render analytics tag… }
 *
 * The contract is documented at https://cookiemunch.net/docs/consent-cookie. It accepts
 * exactly what the embed accepts, so a server never grants what the browser would refuse:
 * strict JSON (URL-encoded or not) and the relaxed object literal Cookiebot writes.
 *
 * This module imports nothing — `@cookiemunch/sdk/consent` pulls in no API client.
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
  /** Consent-policy version the decision was made under (see `minVersion`). */
  ver: number;
  /** When the decision was made, epoch milliseconds (see `expiryDays`). */
  utc: number;
  /** Region code the decision was made in (`unknown` when undetected). */
  region: string;
  /** The anonymous consent-receipt id tying this browser to the consent log. */
  stamp: string;
}

/** The site's consent policy, so the server applies the same rules the embed does. */
export interface ReadConsentOptions {
  /** Cookie name. Default `CookieMunch`. */
  cookieName?: string;
  /**
   * The site's current consent version (`consent.version`, or the config `ver` when that is
   * higher). A decision made under an older version is not honoured by the embed — the
   * visitor is asked again — so it reads as `null` here too.
   */
  minVersion?: number;
  /** The site's `consent.expiryDays`: a decision older than this reads as `null`. */
  expiryDays?: number;
  /** Clock for `expiryDays`, epoch ms. Default `Date.now()`. */
  now?: number;
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

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // not URL-encoded; use as-is
  }
}

/** The embed's own validation (core cookie.ts `normalize`), field for field. */
function normalize(o: unknown): ServerConsent | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (!bool(r.preferences) || !bool(r.statistics) || !bool(r.marketing)) return null;
  if (r.method !== 'explicit' && r.method !== 'implied') return null;
  if (typeof r.ver !== 'number' || typeof r.utc !== 'number') return null;
  if (typeof r.stamp !== 'string' && typeof r.stamp !== 'number') return null;
  if (typeof r.region !== 'string') return null;
  const out: ServerConsent = {
    necessary: true, // never trust a cookie that claims necessary:false
    preferences: r.preferences,
    statistics: r.statistics,
    marketing: r.marketing,
    method: r.method,
    ver: r.ver,
    utc: r.utc,
    region: r.region,
    stamp: String(r.stamp),
  };
  if (r.custom && typeof r.custom === 'object' && !Array.isArray(r.custom)) {
    const custom: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(r.custom as Record<string, unknown>)) if (bool(v)) custom[k] = v;
    if (Object.keys(custom).length > 0) out.custom = custom;
  }
  return out;
}

/**
 * Parse a raw cookie value into a validated ServerConsent, or null. Accepts the two formats
 * the embed reads: URL-encoded (or plain) strict JSON, and Cookiebot's relaxed object
 * literal — `{stamp:'…',necessary:true,…}` — left behind by a site migrating from Cookiebot.
 */
export function parseConsentValue(raw: string): ServerConsent | null {
  if (!raw) return null;
  const decoded = decode(raw);
  try {
    return normalize(JSON.parse(decoded));
  } catch {
    /* not strict JSON — try the Cookiebot literal */
  }
  if (!decoded.includes('necessary')) return null;
  const json = decoded.replace(/'/g, '"').replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":');
  try {
    return normalize(JSON.parse(json));
  } catch {
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Read the visitor's consent from a request: a raw `Cookie` header, a Node `req`, or a Fetch
 * `Request`. Returns null when there is no decision the embed would honour — no cookie, an
 * unparseable one, or (with the options) one made under an older version or past expiry.
 */
export function readConsent(source: ConsentSource, opts: ReadConsentOptions = {}): ServerConsent | null {
  const raw = cookieValue(cookieHeaderOf(source), opts.cookieName ?? CONSENT_COOKIE_NAME);
  const consent = raw ? parseConsentValue(raw) : null;
  if (!consent) return null;
  if (typeof opts.minVersion === 'number' && consent.ver < opts.minVersion) return null;
  if (typeof opts.expiryDays === 'number' && opts.expiryDays > 0) {
    if ((opts.now ?? Date.now()) - consent.utc > opts.expiryDays * DAY_MS) return null;
  }
  return consent;
}

/**
 * Read the visitor's consent from a request. The original spelling of {@link readConsent},
 * kept for existing callers; the second argument is the cookie name.
 */
export function getConsent(source: ConsentSource, cookieName: string = CONSENT_COOKIE_NAME): ServerConsent | null {
  return readConsent(source, { cookieName });
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
