import { describe, it, expect } from 'vitest';
import { createCookieMunch } from '../src/index.js';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** A fake fetch that records calls and replays a queue of responses. */
function fakeFetch(responses: Array<{ status?: number; json?: unknown; text?: string; contentType?: string }>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const r = responses[i++] ?? { status: 200, json: {} };
    const status = r.status ?? 200;
    const contentType = r.contentType ?? (r.text !== undefined ? 'text/csv' : 'application/json');
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
      json: async () => r.json,
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
    } as unknown as Response;
  }) as typeof fetch;
  return { fn, calls };
}

function client(responses: Parameters<typeof fakeFetch>[0]) {
  const { fn, calls } = fakeFetch(responses);
  const fc = createCookieMunch({ apiKey: 'fck_test', baseUrl: 'https://api.example.com', fetch: fn });
  return { fc, calls };
}


/** Numestri F-01: per-language purposes and dryRun on the declaration writes. */
describe('declared cookies: purposes and dryRun', () => {
  it('sends purposes in the body and dryRun as ?dryRun=1', async () => {
    const diff = { added: [], removed: [], changed: [] };
    const { fc, calls } = client([
      { json: { cookie: { name: 's', category: 'necessary', purpose: 'p', purposes: { es: 'x' }, updatedAt: 1 } } },
      { json: { cookie: { name: 's' }, dryRun: true, declared: [], diff } },
      { json: { declared: [], saved: 1, removed: 0, dryRun: true, diff } },
      { json: { dryRun: true, declared: [], diff } },
      { status: 204 },
    ]);
    const one = await fc.sites.declareCookie('cb', 's', { category: 'necessary', purpose: 'p', purposes: { es: 'x' } });
    expect(one.cookie.purposes).toEqual({ es: 'x' });
    expect(calls[0]).toMatchObject({ method: 'PUT', url: 'https://api.example.com/v1/sites/cb/cookies/s', body: { purposes: { es: 'x' } } });

    const dry = await fc.sites.declareCookie('cb', 's', { category: 'necessary', purpose: 'p' }, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(calls[1]!.url).toBe('https://api.example.com/v1/sites/cb/cookies/s?dryRun=1');

    const many = await fc.sites.declareCookies('cb', [{ name: 'a', category: 'necessary', purpose: 'A' }], { replace: true, dryRun: true });
    expect(many.diff).toEqual(diff);
    expect(calls[2]).toMatchObject({ url: 'https://api.example.com/v1/sites/cb/cookies?dryRun=1', body: { replace: true } });

    const del = await fc.sites.undeclareCookie('cb', 's', { dryRun: true });
    expect(del.diff).toEqual(diff);
    expect(calls[3]).toMatchObject({ method: 'DELETE', url: 'https://api.example.com/v1/sites/cb/cookies/s?dryRun=1' });

    await expect(fc.sites.undeclareCookie('cb', 's')).resolves.toBeUndefined();
    expect(calls[4]!.url).toBe('https://api.example.com/v1/sites/cb/cookies/s');
  });
});
