/**
 * Types for `window.__fdConsent`, the shared consent API any embed can code against — a chat
 * widget, a referral snippet, an analytics tag — whatever CMP the page runs. Cookie Munch sets
 * it natively; `fd-consent-shim.js` sets the same object over Cookiebot, OneTrust or no CMP.
 * Type-only: importing this module adds nothing to a bundle.
 *
 *   import type { FdConsent, FdConsentQueue } from '@cookiemunch/sdk';
 *   const fd = (window.__fdConsent ??= { q: [] });
 *   if ('version' in fd) fd.on('change', (s) => …); else fd.q.push(['on', 'change', (s) => …]);
 *
 * `version` changes only with a breaking change; new members do not bump it.
 */

/** What caused a change. The same causes Cookie Munch's ledger records. */
export type FdCause = 'replay' | 'accept' | 'decline' | 'selection' | 'withdraw' | 'implied' | 'sync' | 'request' | 'migrated';

export interface FdSnapshot {
  /** False until the visitor has answered. */
  decided: boolean;
  /** False when this visitor's region and the site's rules need no answer (a default applies). */
  required: boolean;
  /** Every category the site offers (standard, custom, reserved) and its answer. */
  categories: Record<string, boolean>;
  /** The decision's stamp (`CookieMunch.consentId()`), or null. */
  stamp: string | null;
  region: string;
  /** A Global Privacy Control signal was seen. */
  gpc: boolean;
  /** ISO 8601, or null before a decision. */
  decidedAt: string | null;
}

export interface FdRequestOptions {
  /** One sentence in the page's language: what will be stored and why. Shown as the prompt's text. */
  reason: string;
  /** Who is asking: your vendor id. Recorded with the answer. */
  vendor: string;
}

export interface FdConsent {
  readonly version: 1;
  /** `cookiemunch`, or `shim:cookiebot` / `shim:onetrust` / `shim:none`. */
  readonly provider: string;
  /** Resolves once a decision exists, or at once where the region needs none. */
  ready(): Promise<FdSnapshot>;
  /** true / false, or null while a required decision is pending. Never false for "not decided". */
  has(category: string): boolean | null;
  /** Fires once per decision (a returning visitor's as `replay`); a withdrawal synchronously. Returns unsubscribe. */
  on(event: 'change', cb: (snapshot: FdSnapshot, cause: FdCause) => void): () => void;
  /** Ask for one category at the moment you need it. Never re-asks a refusal; one prompt per category per page view. */
  request(category: string, opts: FdRequestOptions): Promise<boolean>;
  /** Not available yet: warns once and does nothing. */
  identify(token: string): void;
  layout: { bottomInset(): number; on(cb: (insetPx: number) => void): () => void };
  /** Calls made on the queue before this existed ran in order; later pushes run at once. */
  q: { push(...calls: FdQueuedCall[]): number };
}

/** A call queued before the real object exists. */
export type FdQueuedCall =
  | ['on', 'change', (snapshot: FdSnapshot, cause: FdCause) => void]
  | ['ready', (snapshot: FdSnapshot) => void]
  | ['request', string, FdRequestOptions, (granted: boolean) => void]
  | ['identify', string];

/** What an embed that loads first creates: `window.__fdConsent = window.__fdConsent || { q: [] }`. */
export interface FdConsentQueue {
  q: FdQueuedCall[];
}

declare global {
  interface Window {
    __fdConsent?: FdConsent | FdConsentQueue;
  }
}
