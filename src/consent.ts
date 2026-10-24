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
  /**
   * `<kid>.<base64url>`: the API's Ed25519 signature over this decision, issued when the
   * ledger recorded it. Absent on a decision no ledger holds (a hand-written cookie).
   */
  sig?: string;
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

/** Where the platform's public signing keys come from, for signatures and consent tokens. */
export interface KeySetOptions {
  /** A key set you already hold (`{ keys: [...] }`). Skips the fetch. */
  jwks?: JsonWebKeySet;
  /** Default `https://api.cookiemunch.net/v1/partner/jwks.json`. */
  jwksUrl?: string;
  /** Injectable fetch. Default: the global one. */
  fetch?: typeof fetch;
}

/** `readConsent` with `requireSigned: true`: only a decision the API signed counts. */
export interface ReadSignedConsentOptions extends ReadConsentOptions, KeySetOptions {
  requireSigned: true;
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
  if (typeof r.sig === 'string') out.sig = r.sig;
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
export function readConsent(source: ConsentSource, opts: ReadSignedConsentOptions): Promise<ServerConsent | null>;
export function readConsent(source: ConsentSource, opts?: ReadConsentOptions & { requireSigned?: false }): ServerConsent | null;
export function readConsent(
  source: ConsentSource,
  opts: ReadConsentOptions & { requireSigned?: boolean } & KeySetOptions = {},
): ServerConsent | null | Promise<ServerConsent | null> {
  const consent = readUnsigned(source, opts);
  if (opts.requireSigned !== true) return consent;
  // CMU-S04: a decision counts only when the API's signature over it verifies against the
  // published key set. A hand-written cookie (no sig) or a forged one reads as no decision.
  if (!consent?.sig) return Promise.resolve(null);
  return verifyDecisionSignature(consent, opts).then((ok) => (ok ? consent : null));
}

function readUnsigned(source: ConsentSource, opts: ReadConsentOptions): ServerConsent | null {
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

// ---- signatures (CMU-S04) and consent tokens (CMU-F06) ----

export const DEFAULT_JWKS_URL = 'https://api.cookiemunch.net/v1/partner/jwks.json';

/** The fields of a decision its signature covers. */
export interface SignableDecision {
  stamp: string;
  ver: number;
  utc: number;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
  custom?: Record<string, boolean> | undefined;
}

/**
 * The exact line the API signs for a recorded decision. Identical to @cookiemunch/core's
 * `consentSignaturePayload` (a server test pins the two together).
 */
export function consentSignaturePayload(d: SignableDecision): string {
  const b = (v: boolean | undefined): string => (v ? '1' : '0');
  const custom = d.custom ?? {};
  const named = Object.keys(custom)
    .sort()
    .map((k) => `${k}=${b(custom[k])}`)
    .join(',');
  return `cmc1|${d.stamp}|${d.ver}|${d.utc}|${b(d.preferences)}${b(d.statistics)}${b(d.marketing)}|${named}`;
}

interface Jwk {
  kty?: string;
  crv?: string;
  x?: string;
  kid?: string;
  alg?: string;
}
export interface JsonWebKeySet {
  keys: Jwk[];
}

const jwksCache = new Map<string, { at: number; set: JsonWebKeySet }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

async function keySet(opts: KeySetOptions, kid: string): Promise<JsonWebKeySet> {
  if (opts.jwks) return opts.jwks;
  const url = opts.jwksUrl ?? DEFAULT_JWKS_URL;
  const hit = jwksCache.get(url);
  // An unknown kid refetches: the key may have rotated since the cached copy.
  if (hit && Date.now() - hit.at < JWKS_TTL_MS && hit.set.keys.some((k) => k.kid === kid)) return hit.set;
  const f = opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (!f) throw new Error('no fetch available to load the key set; pass `jwks`');
  const res = await f(url);
  if (!res.ok) throw new Error(`key set ${url} answered ${res.status}`);
  const set = (await res.json()) as JsonWebKeySet;
  if (!set || !Array.isArray(set.keys)) throw new Error(`key set ${url} is not a JWKS`);
  jwksCache.set(url, { at: Date.now(), set });
  return set;
}

function b64urlBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Ed25519 verify with WebCrypto (Node 20+, Deno, Bun, workers, browsers). */
async function edVerify(jwk: Jwk, data: string, signature: string): Promise<boolean> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto is unavailable in this runtime');
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) return false;
  const key = await subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, { name: 'Ed25519' }, false, ['verify']);
  return subtle.verify({ name: 'Ed25519' }, key, b64urlBytes(signature) as BufferSource, new TextEncoder().encode(data) as BufferSource);
}

/** Does the cookie's `sig` verify for this decision? False on anything malformed. */
export async function verifyDecisionSignature(consent: ServerConsent, opts: KeySetOptions = {}): Promise<boolean> {
  const dot = consent.sig?.lastIndexOf('.') ?? -1;
  if (!consent.sig || dot <= 0) return false;
  const kid = consent.sig.slice(0, dot);
  try {
    const jwk = (await keySet(opts, kid)).keys.find((k) => k.kid === kid);
    if (!jwk) return false;
    return await edVerify(jwk, consentSignaturePayload(consent), consent.sig.slice(dot + 1));
  } catch {
    return false;
  }
}

/** What a consent token (`CookieMunch.getConsentToken()`) asserts. */
export interface ConsentTokenClaims {
  iss: string;
  /** The decision's stamp. */
  sub: string;
  /** `cookiemunch:<cbid>`. */
  aud: string;
  token_use: 'consent';
  cbid: string;
  stamp: string;
  /** Every category the decision answered, `necessary` included. */
  choices: Record<string, boolean>;
  ver: number;
  /** When the decision was made, epoch ms. */
  decidedAt: number;
  cause?: string;
  iat: number;
  exp: number;
}

export interface VerifyTokenOptions extends KeySetOptions {
  /** Require the token to be for this site. */
  cbid?: string;
  /** Clock, epoch ms. Default `Date.now()`. */
  now?: number;
  /** Allowed clock skew, seconds. Default 30. */
  leewaySeconds?: number;
}

/**
 * Verify a consent token from `CookieMunch.getConsentToken()` (CMU-F06) against the published
 * key set and return its claims. Throws on a bad signature, a wrong site, or an expired token.
 */
export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<ConsentTokenClaims> {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new Error('not a JWT');
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let claims: ConsentTokenClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlBytes(h)));
    claims = JSON.parse(new TextDecoder().decode(b64urlBytes(p)));
  } catch {
    throw new Error('malformed token');
  }
  if (header.alg !== 'EdDSA' || !header.kid) throw new Error('unexpected token algorithm');
  const jwk = (await keySet(opts, header.kid)).keys.find((k) => k.kid === header.kid);
  if (!jwk || !(await edVerify(jwk, `${h}.${p}`, s))) throw new Error('bad signature');
  if (claims.token_use !== 'consent') throw new Error('not a consent token');
  const now = (opts.now ?? Date.now()) / 1000;
  const leeway = opts.leewaySeconds ?? 30;
  if (typeof claims.exp !== 'number' || now > claims.exp + leeway) throw new Error('expired');
  if (typeof claims.iat === 'number' && claims.iat > now + leeway) throw new Error('issued in the future');
  if (opts.cbid !== undefined && (claims.cbid !== opts.cbid || claims.aud !== `cookiemunch:${opts.cbid}`)) throw new Error('token is for another site');
  return claims;
}
