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
