import { describe, it, expect } from 'vitest';
import { createCookieMunch, CookieMunchApiError } from '../src/index.js';

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


/**
 * The fifteen operations the SDK was missing. The parity test proves each path is called;
 * these prove the call is shaped right — raw text where the server returns text, the
 * irreversible purge only when asked for, and the least-privilege key fields actually sent.
 */
describe('reseller', () => {
  it('lists, provisions and reads children', async () => {
    const { fc, calls } = client([{ json: { children: [] } }, { status: 201, json: { child: { id: 'c1' }, apiKey: 'fck_x' } }, { json: {} }]);
    await fc.reseller.list();
    const created = await fc.reseller.create({ name: 'Acme', mintKey: true, keyScopes: ['sites:read'] });
    await fc.reseller.get('c1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.com/v1/reseller/customers',
      'POST https://api.example.com/v1/reseller/customers',
      'GET https://api.example.com/v1/reseller/customers/c1',
    ]);
    expect(calls[1]!.body).toEqual({ name: 'Acme', mintKey: true, keyScopes: ['sites:read'] });
    expect(created.apiKey).toBe('fck_x');
  });

  it('suspends by default, and purges only when asked', async () => {
    const { fc, calls } = client([{ status: 204 }, { status: 204 }]);
    await fc.reseller.deprovision('c1');
    await fc.reseller.deprovision('c1', { purge: true });
    expect(calls[0]!.url).toBe('https://api.example.com/v1/reseller/customers/c1');
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[1]!.url).toBe('https://api.example.com/v1/reseller/customers/c1?purge=true');
  });

  it('updates, and clears a DSAR routing override with null', async () => {
    const { fc, calls } = client([{ json: {} }]);
    await fc.reseller.update('c1', { status: 'suspended', dsarRouting: null });
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.body).toEqual({ status: 'suspended', dsarRouting: null });
  });

  it('manages a child’s keys', async () => {
    const { fc, calls } = client([{ json: [] }, { status: 201, json: { key: 'fck_c', prefix: 'fck_c' } }, { status: 204 }]);
    await fc.reseller.listKeys('c1');
    await fc.reseller.mintKey('c1', { name: 'ci', scopes: ['sites:read'], cbids: ['s1'] });
    await fc.reseller.revokeKey('c1', 'fck_c');
    expect(calls[1]!.body).toEqual({ name: 'ci', scopes: ['sites:read'], cbids: ['s1'] });
    expect(`${calls[2]!.method} ${calls[2]!.url}`).toBe('DELETE https://api.example.com/v1/reseller/customers/c1/keys/fck_c');
  });
});

describe('text responses come back as text', () => {
  it('policy is Markdown, with its options in the query', async () => {
    const { fc, calls } = client([{ text: '# Privacy policy', contentType: 'text/markdown' }]);
    const md = await fc.sites.policy('s1', { contactEmail: 'dpo@x.com', jurisdictions: ['gdpr', 'ccpa'] });
    expect(md).toBe('# Privacy policy');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/s1/policy?contactEmail=dpo%40x.com&jurisdictions=gdpr%2Cccpa');
  });

  it('the DSAR response notice is plain text', async () => {
    const { fc } = client([{ text: 'Dear subject,', contentType: 'text/plain' }]);
    expect(await fc.dsar.response('d1')).toBe('Dear subject,');
  });

  it('the RoPA export is CSV', async () => {
    const { fc, calls } = client([{ text: 'name,purpose\n', contentType: 'text/csv' }]);
    expect(await fc.ropa.exportCsv()).toBe('name,purpose\n');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/ropa/export.csv');
  });
});

describe('least-privilege keys', () => {
  /**
   * The SDK's input type used to carry only `name`, with a comment claiming the server
   * ignored the body. It does not — so SDK users simply could not create a scoped,
   * property-locked or expiring key.
   */
  it('sends scopes, a property lock and an expiry', async () => {
    const { fc, calls } = client([{ status: 201, json: { key: 'k', prefix: 'p' } }]);
    await fc.keys.issue({ name: 'agency', scopes: ['consent:read'], cbids: ['cb_shop'], expiresInDays: 30 });
    expect(calls[0]!.body).toEqual({ name: 'agency', scopes: ['consent:read'], cbids: ['cb_shop'], expiresInDays: 30 });
  });
});

describe('the rest', () => {
  it('assessments.autoPopulate sends the evidence and its source', async () => {
    const { fc, calls } = client([{ json: { assessment: {}, applied: ['q1'] } }]);
    await fc.assessments.autoPopulate('a1', { q1: 'yes' }, 'data-map');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/assessments/a1/autopopulate');
    expect(calls[0]!.body).toEqual({ evidence: { q1: 'yes' }, source: 'data-map' });
  });

  it('sites.setAdPersonalization and analyzeSession post to the right place', async () => {
    const { fc, calls } = client([{ json: {} }, { json: {} }]);
    await fc.sites.setAdPersonalization('s1', { enabled: true, default: false });
    await fc.sites.analyzeSession('s1', { requests: [], gpc: true });
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.example.com/v1/sites/s1/elements/ad-personalization',
      'https://api.example.com/v1/sites/s1/sentry',
    ]);
  });

  it('ai.systems lists declared systems', async () => {
    const { fc, calls } = client([{ json: { systems: [] } }]);
    await fc.ai.systems();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/ai/systems');
  });
});

describe('org.mailProvider — bring your own mail provider for rights mail', () => {
  it('get / set / test / remove hit /v1/org/mail-provider', async () => {
    const { fc, calls } = client([
      { json: { configured: false, sender: 'shared' } },
      { json: { configured: true, provider: 'resend', fromEmail: 'p@acme.com', secretLast4: 'abcd', status: 'untested', sender: 'shared' } },
      { json: { ok: true, sentTo: 'me@acme.com', mailProvider: { configured: true, sender: 'own' } } },
      { status: 204 },
    ]);
    expect(await fc.org.mailProvider.get()).toEqual({ configured: false, sender: 'shared' });
    const saved = await fc.org.mailProvider.set({ provider: 'resend', fromEmail: 'p@acme.com', secret: 're_123abcd' });
    expect(saved.secretLast4).toBe('abcd');
    const t = await fc.org.mailProvider.test('me@acme.com');
    expect(t.ok).toBe(true);
    await fc.org.mailProvider.remove();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.com/v1/org/mail-provider',
      'PUT https://api.example.com/v1/org/mail-provider',
      'POST https://api.example.com/v1/org/mail-provider/test',
      'DELETE https://api.example.com/v1/org/mail-provider',
    ]);
    expect(calls[1]?.body).toEqual({ provider: 'resend', fromEmail: 'p@acme.com', secret: 're_123abcd' });
    expect(calls[2]?.body).toEqual({ to: 'me@acme.com' });
  });
});

describe('org.controller — the organisation’s own data-controller identity', () => {
  it('get / set / remove with the right verb, path and body', async () => {
    const view = { set: true, legalName: 'Crossly Ltd', contactEmail: 'privacy@crossly.example', updatedAt: 1 };
    const { fc, calls } = client([{ json: view }, { json: view }, { status: 204 }]);
    expect((await fc.org.controller.get()).set).toBe(true);
    await fc.org.controller.set({ legalName: 'Crossly Ltd', contactEmail: 'privacy@crossly.example' });
    await fc.org.controller.remove();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.com/v1/org/controller',
      'PUT https://api.example.com/v1/org/controller',
      'DELETE https://api.example.com/v1/org/controller',
    ]);
    expect(calls[1]?.body).toEqual({ legalName: 'Crossly Ltd', contactEmail: 'privacy@crossly.example' });
  });
});

describe('consentSyncSecret — the site’s consent-sync signing secret', () => {
  it('get / rotate / remove with the right verb and path', async () => {
    const { fc, calls } = client([
      { json: { cbid: 's 1', configured: false, secretLast4: null, createdAt: null } },
      { status: 201, json: { cbid: 's1', configured: true, secretLast4: 'abcd', createdAt: 1, secret: 'cmss_x_abcd' } },
      { json: { cbid: 's1', configured: false, secretLast4: null, createdAt: null } },
    ]);
    expect((await fc.consentSyncSecret.get('s 1')).configured).toBe(false);
    expect((await fc.consentSyncSecret.rotate('s1')).secret).toBe('cmss_x_abcd');
    await fc.consentSyncSecret.remove('s1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.com/v1/sites/s%201/consent-sync-secret',
      'POST https://api.example.com/v1/sites/s1/consent-sync-secret',
      'DELETE https://api.example.com/v1/sites/s1/consent-sync-secret',
    ]);
  });
});

describe('rightsCaptcha — the rights page’s captcha: your own keys, or off', () => {
  it('site and org default: get / set / remove with the right verb and path', async () => {
    const { fc, calls } = client(Array.from({ length: 6 }, () => ({ json: { source: 'site', mode: 'off', secretSet: false, status: 'disabled', verifiedAt: null, updatedAt: 1 } })));
    expect((await fc.rightsCaptcha.get('s 1')).mode).toBe('off');
    await fc.rightsCaptcha.set('s1', { mode: 'own', provider: 'hcaptcha', siteKey: 'k-12345678', secret: '0xsecret' });
    await fc.rightsCaptcha.remove('s1');
    await fc.org.rightsCaptcha.get();
    await fc.org.rightsCaptcha.set({ mode: 'off' });
    await fc.org.rightsCaptcha.remove();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.com/v1/sites/s%201/rights-captcha',
      'PUT https://api.example.com/v1/sites/s1/rights-captcha',
      'DELETE https://api.example.com/v1/sites/s1/rights-captcha',
      'GET https://api.example.com/v1/org/rights-captcha',
      'PUT https://api.example.com/v1/org/rights-captcha',
      'DELETE https://api.example.com/v1/org/rights-captcha',
    ]);
    expect(calls[1]?.body).toEqual({ mode: 'own', provider: 'hcaptcha', siteKey: 'k-12345678', secret: '0xsecret' });
    expect(calls[4]?.body).toEqual({ mode: 'off' });
  });
});

describe('rightsIdentity — verify rights requesters with your own sign-in sessions', () => {
  it('site and org default: get / set / remove with the right verb and path', async () => {
    const { fc, calls } = client(Array.from({ length: 6 }, () => ({ json: { source: 'site', configured: true, type: 'clerk', status: 'verified', verifiedAt: 1, updatedAt: 1 } })));
    expect((await fc.rightsIdentity.get('s 1')).type).toBe('clerk');
    await fc.rightsIdentity.set('s1', { type: 'clerk', issuer: 'https://clerk.acme.example', authorizedParties: ['https://www.acme.example'] });
    await fc.rightsIdentity.remove('s1');
    await fc.org.rightsIdentity.get();
    await fc.org.rightsIdentity.set({ type: 'oidc_jwt', issuer: 'https://id.acme.example', jwksUrl: 'https://id.acme.example/keys' });
    await fc.org.rightsIdentity.remove();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.com/v1/sites/s%201/rights-identity',
      'PUT https://api.example.com/v1/sites/s1/rights-identity',
      'DELETE https://api.example.com/v1/sites/s1/rights-identity',
      'GET https://api.example.com/v1/org/rights-identity',
      'PUT https://api.example.com/v1/org/rights-identity',
      'DELETE https://api.example.com/v1/org/rights-identity',
    ]);
    expect(calls[1]?.body).toEqual({ type: 'clerk', issuer: 'https://clerk.acme.example', authorizedParties: ['https://www.acme.example'] });
    expect(calls[4]?.body).toEqual({ type: 'oidc_jwt', issuer: 'https://id.acme.example', jwksUrl: 'https://id.acme.example/keys' });
  });
});

describe('rightsPage', () => {
  it('reaches every rights-page operation with the right verb and path', async () => {
    const { fc, calls } = client(Array.from({ length: 9 }, () => ({ json: {} })));
    await fc.rightsPage.get('s 1');
    await fc.rightsPage.put('s1', { v: 1 } as never);
    await fc.rightsPage.patch('s1', { seo: { title: 'x' } });
    await fc.rightsPage.dryRun('s1', { seo: { title: 'x' } });
    await fc.rightsPage.dryRun('s1', { v: 1 }, { mode: 'put' });
    await fc.rightsPage.getPublished('s1');
    await fc.rightsPage.publish('s1');
    await fc.rightsPage.versions('s1');
    await fc.rightsPage.rollback('s1', 3);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.com/v1/sites/s%201/rights-page',
      'PUT https://api.example.com/v1/sites/s1/rights-page',
      'PATCH https://api.example.com/v1/sites/s1/rights-page',
      'PATCH https://api.example.com/v1/sites/s1/rights-page?dryRun=1',
      'PUT https://api.example.com/v1/sites/s1/rights-page?dryRun=1',
      'GET https://api.example.com/v1/sites/s1/rights-page/published',
      'POST https://api.example.com/v1/sites/s1/rights-page/publish',
      'GET https://api.example.com/v1/sites/s1/rights-page/versions',
      'POST https://api.example.com/v1/sites/s1/rights-page/rollback',
    ]);
    expect(calls[8]!.body).toEqual({ version: 3 });
  });
});

describe('rightsPage draft concurrency', () => {
  it('put/patch send baseUpdatedAt when given, and a 409 keeps the stored draft on the error', async () => {
    const stored = { cbid: 's1', draft: { v: 1 }, version: 0, publishedAt: null, updatedAt: 7, warnings: [] };
    const { fc, calls } = client([{ json: {} }, { json: {} }, { json: {} }, { status: 409, json: { error: 'draft_conflict', draft: stored } }]);
    await fc.rightsPage.put('s1', { v: 1 } as never, { baseUpdatedAt: 5 });
    await fc.rightsPage.patch('s1', { seo: { title: 'x' } }, { baseUpdatedAt: null });
    await fc.rightsPage.put('s1', { v: 1 } as never);
    const err = await fc.rightsPage.put('s1', { v: 1 } as never, { baseUpdatedAt: 6 }).catch((e: unknown) => e);
    expect(calls[0]!.body).toEqual({ v: 1, baseUpdatedAt: 5 });
    expect(calls[1]!.body).toEqual({ seo: { title: 'x' }, baseUpdatedAt: null });
    expect(calls[2]!.body).toEqual({ v: 1 });
    expect((err as CookieMunchApiError).status).toBe(409);
    expect((err as CookieMunchApiError).body).toEqual({ error: 'draft_conflict', draft: stored });
  });
});

describe('rightsPage publish/rollback preconditions', () => {
  it('publish and rollback send baseUpdatedAt when given (null included), and nothing extra without it', async () => {
    const { fc, calls } = client(Array.from({ length: 5 }, () => ({ json: {} })));
    await fc.rightsPage.publish('s1', { baseUpdatedAt: 7 });
    await fc.rightsPage.publish('s1', { baseUpdatedAt: null });
    await fc.rightsPage.rollback('s1', 2, { baseUpdatedAt: '2026-10-14T00:00:00.000Z' });
    await fc.rightsPage.rollback('s1', 2);
    await fc.rightsPage.publish('s1');
    expect(calls.map((c) => c.body)).toEqual([
      { baseUpdatedAt: 7 },
      { baseUpdatedAt: null },
      { version: 2, baseUpdatedAt: '2026-10-14T00:00:00.000Z' },
      { version: 2 },
      {},
    ]);
  });
});

describe('CookieMunchApiError', () => {
  it('a 422 keeps its body on the error', async () => {
    const body = { error: 'invalid_page', issues: [{ path: 'seo.favicon', message: 'must be an https:// URL' }] };
    const { fc } = client([{ status: 422, json: body }]);
    const err = await fc.rightsPage.dryRun('s1', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CookieMunchApiError);
    expect((err as CookieMunchApiError).status).toBe(422);
    expect((err as CookieMunchApiError).message).toBe('invalid_page');
    expect((err as CookieMunchApiError).body).toEqual(body);
  });
});

describe('orchestrator-v2 cases (CMU-X21–X24, X37)', () => {
  it('openCase sends the Idempotency-Key and X-ForgeDeck-Trace headers', async () => {
    const { fc: cm, calls } = client([{ status: 201, json: { id: 'dsr_1' } }]);
    await cm.dsar.openCase({ cbid: 's1', type: 'closure', subject: { emails: ['a@b.com'] }, source: 'product' }, { idempotencyKey: 'key-0000000000000001', trace: '01J9ZK3Q7X5R2T8M4N6P0B1C2D' });
    expect(calls[0]).toMatchObject({ method: 'POST', body: { cbid: 's1', type: 'closure' } });
    expect(calls[0]!.url).toMatch(/\/v1\/dsar\/requests$/);
    expect(calls[0]!.headers['idempotency-key']).toBe('key-0000000000000001');
    expect(calls[0]!.headers['x-forgedeck-trace']).toBe('01J9ZK3Q7X5R2T8M4N6P0B1C2D');
  });

  it('reaches every new path', async () => {
    const { fc: cm, calls } = client(Array.from({ length: 9 }, () => ({ json: {} })));
    await cm.dsar.getCase('d 1');
    await cm.dsar.cancelCase('d1');
    await cm.dsar.caseReceipt('d1');
    await cm.dsar.listByTrace('T1');
    await cm.fulfillment.executorConformance('ex1');
    await cm.fulfillment.rollExecutorCompletionSecret('ex1');
    await cm.dsarSettings.set('s1', { graceDays: 14 });
    await cm.dsarSettings.get('s1');
    await cm.integrations.subjectCard('chatly', { iss: 'https://i.example', sub: 'u1' });
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}${new URL(c.url).search}`)).toEqual([
      'GET /v1/dsar/requests/d%201',
      'POST /v1/dsar/requests/d1/cancel',
      'GET /v1/dsar/requests/d1/receipt',
      'GET /v1/dsar?trace=T1',
      'POST /v1/dsar/executors/ex1/test',
      'POST /v1/dsar/executors/ex1/completion-secret/roll',
      'PUT /v1/sites/s1/dsar-settings',
      'GET /v1/sites/s1/dsar-settings',
      'GET /v1/integrations/chatly/card?iss=https%3A%2F%2Fi.example&sub=u1',
    ]);
    expect(calls[4]!.body).toEqual({ conformance: true });
  });
});
