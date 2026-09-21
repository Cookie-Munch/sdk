import { describe, it, expect } from 'vitest';
import { createCookieMunch } from '../src/index.js';

interface Call { url: string; method: string; body?: unknown }

function client(responses: unknown[]) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (input: string | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === 'string' ? input : input.toString(),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = responses[i++] ?? {};
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => json,
      text: async () => JSON.stringify(json),
    } as unknown as Response;
  }) as typeof fetch;
  return { fc: createCookieMunch({ apiKey: 'fck_test', baseUrl: 'https://api.example.com', fetch: fn }), calls };
}

describe('discovery.planEnforcement', () => {
  it('posts the dialect and rules', async () => {
    const { fc, calls } = client([{ plan: { statements: [], revert: [], skipped: [] } }]);
    await fc.discovery.planEnforcement('snowflake', [{ id: 'r', action: 'mask', minSensitivity: 'sensitive' }]);
    expect(calls[0]!.url).toBe('https://api.example.com/v1/discovery/enforcement');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ dialect: 'snowflake', rules: [{ id: 'r', action: 'mask', minSensitivity: 'sensitive' }] });
  });

  it('passes the optional permits table and policy prefix through', async () => {
    const { fc, calls } = client([{ plan: { statements: [], revert: [], skipped: [] } }]);
    await fc.discovery.planEnforcement('snowflake', [{ id: 'r', action: 'mask' }], {
      permitsTable: 'MY_PERMITS',
      policyPrefix: 'acme',
    });
    expect(calls[0]!.body).toMatchObject({ permitsTable: 'MY_PERMITS', policyPrefix: 'acme' });
  });
});

describe('subscriptions.topics', () => {
  it('reads the catalog', async () => {
    const { fc, calls } = client([{ topics: [] }]);
    await fc.subscriptions.topics();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/subscriptions/topics');
    expect(calls[0]!.method).toBe('GET');
  });

  it('replaces the catalog', async () => {
    const topics = [{ code: 'product', name: 'Product news', channels: ['email'] }];
    const { fc, calls } = client([{ topics }]);
    await fc.subscriptions.setTopics(topics);
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.body).toEqual({ topics });
  });
});

describe('regulatory', () => {
  it('reads the whole feed', async () => {
    const { fc, calls } = client([{ reviewedAt: '2026-05-01', regulations: [] }]);
    await fc.regulatory.feed();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/regulatory/feed');
  });

  it('filters by jurisdiction', async () => {
    const { fc, calls } = client([{ reviewedAt: '2026-05-01', regulations: [] }]);
    await fc.regulatory.feed(['US-CA', 'BR']);
    expect(calls[0]!.url).toContain('jurisdictions=US-CA%2CBR');
  });

  it('reads upcoming changes with a horizon', async () => {
    const { fc, calls } = client([{ reviewedAt: '2026-05-01', regulations: [] }]);
    await fc.regulatory.upcoming(90);
    expect(calls[0]!.url).toContain('/v1/regulatory/upcoming');
    expect(calls[0]!.url).toContain('days=90');
  });

  it('omits the horizon when none is given', async () => {
    const { fc, calls } = client([{ reviewedAt: '2026-05-01', regulations: [] }]);
    await fc.regulatory.upcoming();
    expect(calls[0]!.url).not.toContain('days=');
  });
});
