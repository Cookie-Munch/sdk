/**
 * Sign a consent-sync token for a signed-in visitor (https://cookiemunch.net/docs/consent-sync).
 *
 * Hosted consent sync stores a person's consent decision so it follows them to their other
 * browsers. Cookie Munch never trusts an id the page names — anyone can send any id — so your
 * server, which knows who is signed in, signs a short-lived token with the site's consent-sync
 * secret (`client.consentSyncSecret.rotate(cbid)`, shown once) and puts it on the page:
 *
 * @example
 *   import { mintConsentSyncToken } from '@cookiemunch/sdk';
 *   const token = mintConsentSyncToken({
 *     secret: process.env.CM_CONSENT_SYNC_SECRET!, // cmss_…
 *     cbid: 'acme-com-9f3k',
 *     subject: user.id,                           // an opaque id, never an email
 *   });
 *   // in the page, before the embed: <script>window.CookieMunchConfig = { syncToken: "…" }</script>
 *
 * Format: `cms1.<base64url(JSON {c, s, iat, exp})>.<base64url(HMAC-SHA256(secret, "cms1." + payload))>`.
 * Server-side only: uses `node:crypto`. Never put the secret in a page.
 */
import { createHmac } from 'node:crypto';

export interface MintConsentSyncTokenInput {
  /** The site's consent-sync secret (`cmss_…`). */
  secret: string;
  /** The site the token is for. A token for one site is refused by every other. */
  cbid: string;
  /** Who is signed in: 1–128 of `A-Z a-z 0-9 . _ : @ + / = ~ -`. Use an opaque id. */
  subject: string;
  /** Lifetime in seconds. Default 3600; at most 86400 (Cookie Munch refuses longer). */
  ttlSeconds?: number;
  /** Current time in ms (injectable for tests). */
  now?: number;
}

const SUBJECT_RE = /^[A-Za-z0-9._:@+/=~-]{1,128}$/;

export function mintConsentSyncToken(input: MintConsentSyncTokenInput): string {
  if (!input.secret) throw new Error('mintConsentSyncToken: secret is required');
  if (!input.cbid) throw new Error('mintConsentSyncToken: cbid is required');
  if (!SUBJECT_RE.test(input.subject)) throw new Error('mintConsentSyncToken: subject must be 1–128 characters of A-Z a-z 0-9 . _ : @ + / = ~ -');
  const ttl = Math.floor(input.ttlSeconds ?? 3600);
  if (!(ttl >= 1 && ttl <= 86_400)) throw new Error('mintConsentSyncToken: ttlSeconds must be between 1 and 86400');
  const iat = Math.floor((input.now ?? Date.now()) / 1000);
  const payload = Buffer.from(JSON.stringify({ c: input.cbid, s: input.subject, iat, exp: iat + ttl })).toString('base64url');
  const sig = createHmac('sha256', input.secret).update(`cms1.${payload}`).digest('base64url');
  return `cms1.${payload}.${sig}`;
}
