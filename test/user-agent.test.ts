import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCookieMunch, SDK_VERSION } from '../src/index.js';

/** Cloudflare answers a request with no recognisable User-Agent with `403 error code: 1010`. */
function recorder() {
  const seen: Array<Record<string, string>> = [];
  const fetch = (async (_u: string, init?: RequestInit) => {
    seen.push(init?.headers as Record<string, string>);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { seen, fetch };
}

describe('User-Agent', () => {
  it('names the SDK and its version by default', async () => {
    const r = recorder();
    await createCookieMunch({ apiKey: 'fck_x', baseUrl: 'https://api.test', fetch: r.fetch }).me();
    expect(r.seen[0]!['User-Agent']).toBe(`cookiemunch-js/${SDK_VERSION}`);
  });

  it('the version is the package version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(SDK_VERSION).toBe(pkg.version);
  });

  it('the caller can set their own', async () => {
    const r = recorder();
    await createCookieMunch({ apiKey: 'fck_x', baseUrl: 'https://api.test', fetch: r.fetch, userAgent: 'acme-deploy/2' }).me();
    expect(r.seen[0]!['User-Agent']).toBe('acme-deploy/2');
  });
});
