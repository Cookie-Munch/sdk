/**
 * CMU-S04 / F06 on the server side: readConsent({ requireSigned }) and verifyToken, checked
 * against the platform key set — no shared secret.
 */
import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readConsent, verifyToken, consentSignaturePayload, type JsonWebKeySet } from '../src/consent.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string };
const jwks: JsonWebKeySet = { keys: [{ ...jwk, kid: 'cmp-test', alg: 'EdDSA' }] };
const ed = (data: string) => sign(null, Buffer.from(data), privateKey).toString('base64url');

const decision = { necessary: true, preferences: true, statistics: false, marketing: false, method: 'explicit', ver: 1, utc: 1700000000000, region: 'de', stamp: 's-1', custom: { referrals: true } };
const cookie = (d: Record<string, unknown>) => `other=1; CookieMunch=${encodeURIComponent(JSON.stringify(d))}`;
const signed = (d = decision) => ({ ...d, sig: `cmp-test.${ed(consentSignaturePayload(d))}` });

describe('readConsent with requireSigned', () => {
  it('without it, stays synchronous and returns any well-formed decision (unchanged)', () => {
    expect(readConsent(cookie(decision))?.statistics).toBe(false);
  });

  it('accepts a decision whose signature verifies', async () => {
    const c = await readConsent(cookie(signed()), { requireSigned: true, jwks });
    expect(c?.stamp).toBe('s-1');
    expect(c?.custom).toEqual({ referrals: true });
  });

  it('refuses a hand-written cookie (no sig) and a tampered one', async () => {
    expect(await readConsent(cookie(decision), { requireSigned: true, jwks })).toBeNull();
    expect(await readConsent(cookie({ ...signed(), marketing: true }), { requireSigned: true, jwks })).toBeNull();
    expect(await readConsent(cookie({ ...signed(), sig: 'cmp-other.AAAA' }), { requireSigned: true, jwks })).toBeNull();
  });

  it('fetches the key set once when not given one', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(jwks)));
    const url = 'https://keys.test/jwks.json';
    expect(await readConsent(cookie(signed()), { requireSigned: true, jwksUrl: url, fetch: fetch as never })).not.toBeNull();
    expect(await readConsent(cookie(signed()), { requireSigned: true, jwksUrl: url, fetch: fetch as never })).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('verifyToken', () => {
  const now = 1_700_000_000_000;
  const mint = (claims: Record<string, unknown>, kid = 'cmp-test') => {
    const h = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid })).toString('base64url');
    const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${h}.${p}.${ed(`${h}.${p}`)}`;
  };
  const claims = { iss: 'https://api.cookiemunch.net', sub: 's-1', aud: 'cookiemunch:cb-1', token_use: 'consent', cbid: 'cb-1', stamp: 's-1', choices: { necessary: true, marketing: false }, ver: 1, decidedAt: 1, iat: now / 1000, exp: now / 1000 + 600 };

  it('returns the claims of a good token', async () => {
    await expect(verifyToken(mint(claims), { jwks, cbid: 'cb-1', now })).resolves.toMatchObject({ stamp: 's-1', choices: { marketing: false } });
  });

  it('throws on a bad signature, another site, expiry, or another kind of token', async () => {
    const t = mint(claims);
    await expect(verifyToken(t.slice(0, -4) + 'AAAA', { jwks, now })).rejects.toThrow(/signature/);
    await expect(verifyToken(t, { jwks, cbid: 'cb-2', now })).rejects.toThrow(/another site/);
    await expect(verifyToken(t, { jwks, now: now + 700_000 })).rejects.toThrow(/expired/);
    await expect(verifyToken(mint({ ...claims, token_use: 'session' }), { jwks, now })).rejects.toThrow(/consent token/);
    await expect(verifyToken('nope', { jwks })).rejects.toThrow();
  });
});
