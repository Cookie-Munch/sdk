/**
 * `@cookiemunch/sdk/embed` — typed, framework-free access to the browser embed's `window.CookieMunch`.
 *
 *   import { onConsent, consentState } from '@cookiemunch/sdk/embed';
 *   onConsent('statistics', () => loadAnalytics());
 *
 * Every helper is safe to call during server-side rendering (no window: `null`, `false` or a no-op)
 * and before the embed has loaded: `onConsent` joins the embed's own early queue (`__q`), which the
 * embed replays when it starts. On a path out of the site's `scope` the embed never starts, so a
 * queued callback never runs.
 *
 * The types mirror `packages/react/src/types.ts` (a test pins the two equal); this module adds no
 * `Window` augmentation, so it can sit next to `@cookiemunch/react` in one project.
 */

/** The four base consent categories. */
export type Category = 'necessary' | 'preferences' | 'statistics' | 'marketing';

/**
 * The visitor's consent snapshot, mirroring what the embed exposes at
 * `window.CookieMunch.consent`. Includes the four base categories, the granular
 * advertising signals, and a receipt `stamp`. Custom category keys may also be
 * present, hence the index signature.
 */
export interface PublicConsent {
  necessary: boolean;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
  /** Granular advertising signals (IAB TCF purposes), else fall back to `marketing`. */
  personalizedAds: boolean;
  basicAds: boolean;
  adProfiling: boolean;
  adMeasurement: boolean;
  /** The current consent-receipt stamp. */
  stamp: string;
  /** Custom category keys are included when the site defines them. */
  [key: string]: boolean | string;
}

/**
 * The minimal shape of the global `window.CookieMunch` API this wrapper relies
 * on. The real embed exposes a superset of this (Cookiebot-compatible facade);
 * we only type the members we call.
 */
/**
 * Empty until you augment it with your site's category ids (`cookiemunch types` writes the augmentation):
 *
 *   declare module '@cookiemunch/sdk/embed' { interface CookieMunchCategories { necessary: true; statistics: true } }
 */
export interface CookieMunchCategories {}

/** A category id: one of CookieMunchCategories' keys once augmented, any string until then. */
export type CategoryId = [keyof CookieMunchCategories] extends [never] ? string : Extract<keyof CookieMunchCategories, string>;

export interface CookieMunchGlobal {
  readonly consent: PublicConsent;
  readonly consented: boolean;
  readonly hasResponse: boolean;
  /** The site id, including one resolved from the page host (`data-cbid="auto"`); undefined until known. */
  cbid?: string;
  show(): void;
  renew(): void;
  /** Open the preference center / second layer. */
  showSettings(): void;
  withdraw(): void;
  submitCustomConsent(preferences: boolean, statistics: boolean, marketing: boolean): void;
  /** Subscribe to consent changes (accept/decline). Returns an unsubscribe fn. */
  onConsentChange(callback: (state: unknown) => void): () => void;
  /**
   * Whether `category` (a site category id or an alias such as `functional`) is consented.
   * An unknown category answers false. Optional: older embeds lack it.
   */
  hasConsent?(category: CategoryId): boolean;
  /** `true` granted, `false` refused (or unknown name), `null` not decided yet. Optional: older embeds lack it. */
  consentState?(category: CategoryId): boolean | null;
  /** Call `callback` once when `category` is granted (a microtask later if it already is). Returns an unsubscribe. Optional: older embeds lack it. */
  onConsent?(category: CategoryId, callback: () => void): () => void;
  /** Draw the cookie declaration into `el` (all mounts when omitted). Optional: older embeds lack it. */
  renderDeclaration?(el?: Element | null): Promise<void>;
}

type QueueEntry = [string, unknown[], unknown?];
type Slot = { CookieMunch?: Partial<CookieMunchGlobal> & { __q?: QueueEntry[] } };

/** `window.CookieMunch`, or undefined during SSR or before the embed (or its stub) exists. */
export function getCookieMunch(): CookieMunchGlobal | undefined {
  return typeof window === 'undefined' ? undefined : ((window as unknown as Slot).CookieMunch as CookieMunchGlobal | undefined);
}

/** `true` granted, `false` refused, `null` not decided yet — or no embed (SSR, not loaded). */
export function consentState(category: CategoryId): boolean | null {
  return getCookieMunch()?.consentState?.(category) ?? null;
}

/** Whether `category` is consented. False whenever it cannot be known yet. */
export function hasConsent(category: CategoryId): boolean {
  return getCookieMunch()?.hasConsent?.(category) ?? false;
}

/**
 * Run `callback` once `category` is granted. Before the embed loads the call is queued for it,
 * exactly as its own early stub would. Returns an unsubscribe; a no-op during SSR.
 */
export function onConsent(category: CategoryId, callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as unknown as Slot;
  const cm = w.CookieMunch;
  if (typeof cm?.onConsent === 'function') return cm.onConsent(category, callback);
  // An embed too old to have onConsent: nothing to queue for.
  if (cm && !cm.__q) return () => {};
  // No embed yet (or only the queue this created): the embed adopts an existing `__q` and replays it.
  const q = cm?.__q ?? (w.CookieMunch = { __q: [] }).__q!;
  const entry: QueueEntry = ['onConsent', [category, callback]];
  q.push(entry);
  return () => {
    const at = q.indexOf(entry);
    if (at >= 0) q.splice(at, 1);
    else if (typeof entry[2] === 'function') (entry[2] as () => void)();
  };
}
