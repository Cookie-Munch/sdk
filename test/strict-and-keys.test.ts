/** X-14/X-15 in the TS SDK: the strict preference on writes only; keys.report; expiresAt. */
import { describe, it, expect } from 'vitest';
import { createCookieMunch } from '../src/index.js';

function client(strict: boolean) {
  const calls: Array<{ url: string; method: string; prefer: string | undefined; body?: unknown }> = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    calls.push({ url, method: init.method ?? 'GET', prefer: h.Prefer, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { cm: createCookieMunch({ apiKey: 'fck_x', baseUrl: 'https://api.test', fetch, strictUnknownFields: strict }), calls };
}

describe('TS SDK', () => {
  it('sends Prefer: strict-unknown-fields on writes only, and only when asked', async () => {
    const { cm, calls } = client(true);
    await cm.keys.list();
    await cm.keys.update('fck_1234', { expiresAt: null });
    expect(calls[0]!.prefer).toBeUndefined();
    expect(calls[1]).toMatchObject({ method: 'PATCH', prefer: 'strict-unknown-fields', body: { expiresAt: null } });
    const lax = client(false);
    await lax.cm.keys.issue({ expiresAt: '2030-01-01T00:00:00Z' });
    expect(lax.calls[0]).toMatchObject({ prefer: undefined, body: { expiresAt: '2030-01-01T00:00:00Z' } });
  });
  it('keys.report passes the day counts', async () => {
    const { cm, calls } = client(false);
    await cm.keys.report({ unusedDays: 30 });
    expect(calls[0]!.url).toBe('https://api.test/v1/keys/report?unusedDays=30');
  });
});
