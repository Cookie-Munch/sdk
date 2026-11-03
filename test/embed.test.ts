// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { consentState, hasConsent, onConsent, getCookieMunch } from '../src/embed.js';

const w = window as unknown as Record<string, unknown>;
afterEach(() => {
  delete w.CookieMunch;
});

describe('@cookiemunch/sdk/embed', () => {
  it('answers "not known" with no embed on the page', () => {
    expect(getCookieMunch()).toBeUndefined();
    expect(consentState('statistics')).toBeNull();
    expect(hasConsent('statistics')).toBe(false);
  });

  it('reads the live embed', () => {
    w.CookieMunch = { hasConsent: (c: string) => c === 'statistics', consentState: (c: string) => (c === 'statistics' ? true : null) };
    expect(hasConsent('statistics')).toBe(true);
    expect(hasConsent('marketing')).toBe(false);
    expect(consentState('statistics')).toBe(true);
    expect(consentState('marketing')).toBeNull();
  });

  it('queues onConsent in the embed\'s `__q` before the embed exists; unsubscribe takes it back out', () => {
    const cb = vi.fn();
    onConsent('statistics', cb);
    const off = onConsent('marketing', () => {});
    const q = (w.CookieMunch as { __q: unknown[][] }).__q;
    expect(q.map((e) => e[0])).toEqual(['onConsent', 'onConsent']);
    off();
    expect(q).toEqual([['onConsent', ['statistics', cb]]]);
  });

  it('calls the embed\'s own onConsent (its early stub or the real one) when there is one', () => {
    const unsubscribe = () => {};
    const real = vi.fn(() => unsubscribe);
    w.CookieMunch = { onConsent: real };
    const cb = () => {};
    expect(onConsent('statistics', cb)).toBe(unsubscribe);
    expect(real).toHaveBeenCalledWith('statistics', cb);
  });

  it('is a no-op on an embed too old to have onConsent', () => {
    const old = { consented: true };
    w.CookieMunch = old;
    expect(typeof onConsent('statistics', () => {})).toBe('function');
    expect(w.CookieMunch).toBe(old);
  });
});
