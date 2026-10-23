import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { mintConsentSyncToken } from '../src/index.js';

describe('mintConsentSyncToken', () => {
  it('signs cms1.<payload>.<HMAC> binding the site, the subject and the expiry', () => {
    const t = mintConsentSyncToken({ secret: 'cmss_s', cbid: 'acme', subject: 'user_42', ttlSeconds: 600, now: 1_800_000_000_000 });
    const [prefix, payload, sig] = t.split('.');
    expect(prefix).toBe('cms1');
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({ c: 'acme', s: 'user_42', iat: 1_800_000_000, exp: 1_800_000_600 });
    expect(sig).toBe(createHmac('sha256', 'cmss_s').update(`cms1.${payload}`).digest('base64url'));
  });

  it('refuses what Cookie Munch would refuse, before it reaches a page', () => {
    expect(() => mintConsentSyncToken({ secret: '', cbid: 'a', subject: 'u' })).toThrow(/secret/);
    expect(() => mintConsentSyncToken({ secret: 's', cbid: '', subject: 'u' })).toThrow(/cbid/);
    expect(() => mintConsentSyncToken({ secret: 's', cbid: 'a', subject: 'a b' })).toThrow(/subject/);
    expect(() => mintConsentSyncToken({ secret: 's', cbid: 'a', subject: 'u', ttlSeconds: 86_401 })).toThrow(/ttlSeconds/);
  });
});
