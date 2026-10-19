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

describe('fulfillment: executor webhooks and dry runs', () => {
  it('tests a delivery, reads the delivery log, and dry-runs a connect and an edit', async () => {
    const { fc, calls } = client([{ verified: true, stage: null, reason: null }, [], { dryRun: true }, { dryRun: true }]);
    const delivery = { headers: { 'x-sig': 'v1,abc' }, body: '{"a":1}' };
    expect(await fc.fulfillment.testExecutorWebhook('ex 1', delivery)).toEqual({ verified: true, stage: null, reason: null });
    await fc.fulfillment.executorWebhookDeliveries('ex 1');
    await fc.fulfillment.dryRunConnectExecutor({ system: 'crm', baseUrl: 'https://crm.example', secretKey: 'sk_12345678', profile: {} as never });
    await fc.fulfillment.dryRunUpdateExecutor('ex 1', { auto: false });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.example.com/v1/dsar/executors/ex%201/webhook/test',
      'GET https://api.example.com/v1/dsar/executors/ex%201/webhook/deliveries',
      'POST https://api.example.com/v1/dsar/executors?dryRun=1',
      'PATCH https://api.example.com/v1/dsar/executors/ex%201?dryRun=1',
    ]);
    expect(calls[0]!.body).toEqual(delivery);
    expect(calls[3]!.body).toEqual({ auto: false });
  });
});

describe('fulfillment: executor presets, canary and upgrade (CKM-S-25, CKM-S-28)', () => {
  it('lists presets, connects from one, tests with the canary and upgrades (dry run first)', async () => {
    const { fc, calls } = client([{ canaryEmail: 'c@canary.cookiemunch.net', presets: [] }, { id: 'ex 1' }, { ok: true }, { dryRun: true }, { id: 'ex 1', diff: [] }]);
    await fc.fulfillment.executorPresets();
    await fc.fulfillment.connectExecutor({ preset: 'forumulate', orgId: 'org-1', secretKey: 'fck_12345678' });
    await fc.fulfillment.testExecutor('ex 1', { canary: true });
    await fc.fulfillment.dryRunUpgradeExecutorPreset('ex 1');
    await fc.fulfillment.upgradeExecutorPreset('ex 1', { atlasIdAppId: 'app_1' });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.com/v1/dsar/executors/presets',
      'POST https://api.example.com/v1/dsar/executors',
      'POST https://api.example.com/v1/dsar/executors/ex%201/test',
      'POST https://api.example.com/v1/dsar/executors/ex%201/upgrade-preset?dryRun=1',
      'POST https://api.example.com/v1/dsar/executors/ex%201/upgrade-preset',
    ]);
    expect(calls[1]!.body).toEqual({ preset: 'forumulate', orgId: 'org-1', secretKey: 'fck_12345678' });
    expect(calls[2]!.body).toEqual({ canary: true });
    expect(calls[3]!.body).toEqual({});
    expect(calls[4]!.body).toEqual({ atlasIdAppId: 'app_1' });
  });
});
