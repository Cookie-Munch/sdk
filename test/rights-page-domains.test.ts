import { describe, it, expect } from 'vitest';
import { createCookieMunch } from '../src/index.js';

function client(json: unknown = {}, status = 200) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined });
    return {
      ok: status < 300, status,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => json, text: async () => JSON.stringify(json),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  return { fc: createCookieMunch({ apiKey: 'fck_test', baseUrl: 'https://api.example.com', fetch }), calls };
}

describe('rightsPage domains', () => {
  it('lists', async () => {
    const { fc, calls } = client({ domains: [], limit: 1, used: 0, target: 'cname.cookiemunch.net' });
    const r = await fc.rightsPage.listDomains('site 1');
    expect(r.limit).toBe(1);
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'https://api.example.com/v1/sites/site%201/rights-page/domains' });
  });

  it('adds with the hostname in the body', async () => {
    const { fc, calls } = client({ hostname: 'privacy.acme.com' }, 201);
    await fc.rightsPage.addDomain('s', 'privacy.acme.com');
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://api.example.com/v1/sites/s/rights-page/domains', body: { hostname: 'privacy.acme.com' } });
  });

  it('verifies and removes, encoding the hostname', async () => {
    const { fc, calls } = client({});
    await fc.rightsPage.verifyDomain('s', 'datenschutz.bücher.de');
    await fc.rightsPage.removeDomain('s', 'privacy.acme.com');
    expect(calls[0]).toMatchObject({ method: 'POST', url: `https://api.example.com/v1/sites/s/rights-page/domains/${encodeURIComponent('datenschutz.bücher.de')}/verify` });
    expect(calls[1]).toMatchObject({ method: 'DELETE', url: 'https://api.example.com/v1/sites/s/rights-page/domains/privacy.acme.com' });
  });
});
