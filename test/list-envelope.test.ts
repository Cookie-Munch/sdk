/** API version 2026-11-03 envelopes lists as { data }; the SDK hands back the array under either version. */
import { describe, it, expect } from 'vitest';
import { createCookieMunch } from '../src/index.js';

function client(body: unknown, version: string) {
  const fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'cookiemunch-version': version } })) as unknown as typeof globalThis.fetch;
  return createCookieMunch({ apiKey: 'fck_x', baseUrl: 'https://api.test', fetch });
}

describe('list envelope', () => {
  const rows = [{ id: 'ex_1' }];
  it('unwraps { data } from 2026-11-03 and passes a bare array through', async () => {
    expect(await client({ data: rows }, '2026-11-03').sites.list()).toEqual(rows);
    expect(await client({ data: rows, next: '123' }, '2026-11-03').sites.list()).toEqual(rows);
    expect(await client(rows, '2026-01-01').sites.list()).toEqual(rows);
  });
  it('leaves an object that only looks like an envelope alone under an older version, or with other fields', async () => {
    expect(await client({ data: rows }, '2026-10-24').sites.list()).toEqual({ data: rows });
    expect(await client({ data: rows, total: 1 }, '2026-11-03').sites.list()).toEqual({ data: rows, total: 1 });
  });
});
