/** sites.lintConfig — consent-button parity of a proposed config, nothing saved. */
import { describe, it, expect } from 'vitest';
import { createCookieMunch, type ButtonParityLint } from '../src/index.js';

function client(json: unknown) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { fc: createCookieMunch({ apiKey: 'fck_test', baseUrl: 'https://api.example.com', fetch }), calls };
}

const LINT: ButtonParityLint = {
  mode: 'merged',
  designWarnings: [{
    code: 'saturation_gap', severity: 'warning', layer: 'banner',
    accept: { label: 'Accept all', element: 'button', background: '#22c55e' },
    reject: { label: 'Reject all', element: 'button', background: '#6b4f2a' },
    metric: { name: 'chroma', accept: 0.19, reject: 0.07, value: 0.12, threshold: 0.08 },
    detail: 'Accept is bright…', fix: 'Use the same colour…', where: { view: 'bar' },
  }],
  score: 80,
  suggestedReject: [{ layer: 'banner', background: '#22c55e' }],
};

describe('sites.lintConfig', () => {
  it('POSTs the proposed config to …/config/lint', async () => {
    const { fc, calls } = client(LINT);
    const r = await fc.sites.lintConfig('my site', { banner: { type: 'accept-only' } });
    expect(calls).toEqual([{ url: 'https://api.example.com/v1/sites/my%20site/config/lint', method: 'POST', body: { banner: { type: 'accept-only' } } }]);
    expect(r.designWarnings[0]!.code).toBe('saturation_gap');
  });
  it('replace: true lints the body as sent', async () => {
    const { fc, calls } = client(LINT);
    await fc.sites.lintConfig('s', { v: 2 }, { replace: true });
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/s/config/lint?replace=1');
  });
});
