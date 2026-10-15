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



describe('retiring a cookie', () => {
  it('retireCookie POSTs …/cookies/{name}/retire with renamedTo and note; dryRun as ?dryRun=1', async () => {
    const { fc, calls } = client([
      { json: { cookie: { name: 'old', at: 1, renamedTo: 'new' }, matched: ['old'] } },
      { json: { cookie: { name: 'atlas_*', at: 1 }, matched: ['atlas_a'], dryRun: true, retired: [] } },
    ]);
    const r = await fc.sites.retireCookie('a', 'old', { renamedTo: 'new', note: 'v2' });
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://api.example.com/v1/sites/a/cookies/old/retire', body: { renamedTo: 'new', note: 'v2' } });
    expect(r.matched).toEqual(['old']);
    await fc.sites.retireCookie('a', 'atlas_*', {}, { dryRun: true });
    expect(calls[1]!.url).toBe('https://api.example.com/v1/sites/a/cookies/atlas_*/retire?dryRun=1');
  });

  it('unretireCookie DELETEs; dryRun returns what would remain', async () => {
    const { fc, calls } = client([{ status: 204 }, { json: { dryRun: true, retired: [] } }]);
    expect(await fc.sites.unretireCookie('a', 'old')).toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://api.example.com/v1/sites/a/cookies/old/retire' });
    expect(await fc.sites.unretireCookie('a', 'old', { dryRun: true })).toEqual({ dryRun: true, retired: [] });
    expect(calls[1]!.url).toBe('https://api.example.com/v1/sites/a/cookies/old/retire?dryRun=1');
  });
});

describe('waiting for a scan', () => {
  it('scan and scanStatus pass ?wait= (seconds)', async () => {
    const { fc, calls } = client([{ json: { status: 'idle', state: 'done', lastScannedAt: 1 } }, { json: { status: 'idle', state: 'done', lastScannedAt: 1 } }]);
    await fc.sites.scan('a', { wait: 30 });
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://api.example.com/v1/sites/a/scan?wait=30' });
    await fc.sites.scanStatus('a', { wait: 5 });
    expect(calls[1]).toMatchObject({ method: 'GET', url: 'https://api.example.com/v1/sites/a/scan?wait=5' });
  });

  it('waitForScan long-polls until the scan settles', async () => {
    const { fc, calls } = client([
      { json: { status: 'scanning', state: 'scanning', scanId: 's1', lastScannedAt: null } },
      { json: { status: 'idle', state: 'done', scanId: 's1', lastScannedAt: 9, cookieCount: 4 } },
    ]);
    const r = await fc.sites.waitForScan('a', { timeoutMs: 120_000 });
    expect(r).toMatchObject({ state: 'done', cookieCount: 4 });
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.method === 'GET' && c.url === 'https://api.example.com/v1/sites/a/scan?wait=60')).toBe(true);
  });

  it('waitForScan never asks the server to wait longer than is left, and returns the running state at the deadline', async () => {
    const running = { json: { status: 'scanning', state: 'scanning', lastScannedAt: null } };
    // This fake answers at once; a server that ignores `wait` must not be hammered either.
    const { fc, calls } = client([running, running, running, running, running]);
    const t0 = Date.now();
    const r = await fc.sites.waitForScan('a', { timeoutMs: 1500 });
    expect(r.status).toBe('scanning');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/scan?wait=1.5');
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1400);
  });
});
