import { describe, it, expect } from 'vitest';
import { getConsent, isAllowed, parseConsentValue } from '../src/consent.js';

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
