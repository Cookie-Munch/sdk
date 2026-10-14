import { describe, it, expect } from 'vitest';
import { getConsent, isAllowed, parseConsentValue, readConsent } from '../src/consent.js';

const val = (o: object) => encodeURIComponent(JSON.stringify(o));
const state = { necessary: true, preferences: false, statistics: true, marketing: false, method: 'explicit', ver: 1, utc: 1, stamp: 's', region: 'gb' };

describe('server-side getConsent', () => {
  it('reads from a raw Cookie header (among others)', () => {
    const c = getConsent(`other=1; CookieMunch=${val(state)}; x=y`);
    expect(c).toMatchObject({ statistics: true, marketing: false, method: 'explicit', region: 'gb' });
    expect(c?.necessary).toBe(true);
  });
  it('reads from a Node-style req (headers.cookie)', () => {
    expect(getConsent({ headers: { cookie: `CookieMunch=${val(state)}` } })?.statistics).toBe(true);
  });
  it('reads from a Fetch Request (headers.get)', () => {
    const req = { headers: { get: (n: string) => (n === 'cookie' ? `CookieMunch=${val(state)}` : null) } };
    expect(getConsent(req)?.marketing).toBe(false);
  });
  it('returns null for absent / garbage / no source', () => {
    expect(getConsent('foo=bar')).toBeNull();
    expect(getConsent('CookieMunch=not-json')).toBeNull();
    expect(getConsent(undefined)).toBeNull();
  });
  it('never trusts necessary:false', () => {
    expect(parseConsentValue(val({ ...state, necessary: false }))?.necessary).toBe(true);
  });
  it('isAllowed: necessary always; missing = blocked; explicit grants', () => {
    const c = getConsent(`CookieMunch=${val(state)}`);
    expect(isAllowed(c, 'necessary')).toBe(true);
    expect(isAllowed(c, 'statistics')).toBe(true);
    expect(isAllowed(c, 'marketing')).toBe(false);
    expect(isAllowed(null, 'statistics')).toBe(false);
    expect(isAllowed(null, 'necessary')).toBe(true);
  });
  it('custom categories', () => {
    const c = getConsent(`CookieMunch=${val({ ...state, custom: { ads: true } })}`);
    expect(isAllowed(c, 'ads')).toBe(true);
    expect(isAllowed(c, 'other')).toBe(false);
  });
});

/**
 * `readConsent` is the documented server reader (docs/public/consent-cookie.md). It accepts
 * exactly the formats the embed accepts, and applies the same version/expiry policy when
 * told it, so a server never honours a decision the browser has stopped honouring.
 */
describe('readConsent', () => {
  it('reads strict JSON, URL-encoded or not', () => {
    expect(readConsent(`CookieMunch=${val(state)}`)?.statistics).toBe(true);
    expect(readConsent(`CookieMunch=${JSON.stringify(state)}`)?.statistics).toBe(true);
  });

  it('exposes ver, utc, region and stamp', () => {
    expect(readConsent(`CookieMunch=${val({ ...state, ver: 3, utc: 1700000000000 })}`)).toMatchObject({
      ver: 3,
      utc: 1700000000000,
      region: 'gb',
      stamp: 's',
    });
  });

  it('reads the relaxed object literal Cookiebot writes (a site migrating from Cookiebot)', () => {
    const literal =
      "{stamp:'-1',necessary:true,preferences:true,statistics:false,marketing:true,method:'explicit',ver:1,utc:1700000000000,region:'de'}";
    for (const raw of [literal, encodeURIComponent(literal)]) {
      expect(readConsent(`CookieMunch=${raw}`)).toMatchObject({
        preferences: true,
        statistics: false,
        marketing: true,
        region: 'de',
        stamp: '-1',
      });
    }
  });

  it('accepts a numeric stamp, as the embed does', () => {
    expect(readConsent(`CookieMunch=${val({ ...state, stamp: 42 })}`)?.stamp).toBe('42');
  });

  it('refuses what the embed refuses: a cookie missing ver, utc, stamp or region', () => {
    for (const k of ['ver', 'utc', 'stamp', 'region']) {
      const partial: Record<string, unknown> = { ...state };
      delete partial[k];
      expect(readConsent(`CookieMunch=${val(partial)}`), k).toBeNull();
    }
    expect(readConsent(`CookieMunch=${val({ ...state, method: 'maybe' })}`)).toBeNull();
  });

  it('accepts a Node req and a Fetch Request too', () => {
    expect(readConsent({ headers: { cookie: `CookieMunch=${val(state)}` } })?.statistics).toBe(true);
    expect(readConsent({ headers: { get: () => `CookieMunch=${val(state)}` } })?.statistics).toBe(true);
  });

  it('minVersion: a decision under an older policy version is not honoured', () => {
    const header = `CookieMunch=${val({ ...state, ver: 2 })}`;
    expect(readConsent(header, { minVersion: 2 })).not.toBeNull();
    expect(readConsent(header, { minVersion: 3 })).toBeNull();
  });

  it('expiryDays: a decision older than the window is not honoured', () => {
    const day = 86_400_000;
    const header = `CookieMunch=${val({ ...state, utc: 1000 * day })}`;
    expect(readConsent(header, { expiryDays: 30, now: 1029 * day })).not.toBeNull();
    expect(readConsent(header, { expiryDays: 30, now: 1031 * day })).toBeNull();
  });

  it('cookieName reads a renamed cookie; getConsent stays as the older spelling', () => {
    expect(readConsent(`Other=${val(state)}`, { cookieName: 'Other' })?.statistics).toBe(true);
    expect(getConsent(`Other=${val(state)}`, 'Other')?.statistics).toBe(true);
  });

  it('the consent module imports nothing, so the subpath stays dependency-free', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/consent.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
