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

describe('auth + base url', () => {
  it('sends the API key as a Bearer header', async () => {
    const { fc, calls } = client([{ json: { orgId: 'o1', plan: 'free', keyPrefix: 'fck_test' } }]);
    await fc.me();
    expect(calls[0]!.headers['authorization']).toBe('Bearer fck_test');
  });

  it('targets baseUrl + /v1 path', async () => {
    const { fc, calls } = client([{ json: { orgId: 'o1', plan: 'free', keyPrefix: 'x' } }]);
    await fc.me();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/me');
  });

  it('strips a trailing slash from baseUrl', async () => {
    const { fn, calls } = fakeFetch([{ json: {} }]);
    const fc = createCookieMunch({ apiKey: 'k', baseUrl: 'https://api.example.com/', fetch: fn });
    await fc.me();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/me');
  });
});

describe('sites', () => {
  it('list', async () => {
    const { fc, calls } = client([{ json: [{ cbid: 'a', orgId: 'o', domain: 'a.com' }] }]);
    const sites = await fc.sites.list();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites');
    expect(sites[0]!.cbid).toBe('a');
  });

  it('create POSTs a body', async () => {
    const { fc, calls } = client([{ status: 201, json: { cbid: 'gen', orgId: 'o', domain: 'a.com' } }]);
    const site = await fc.sites.create({ domain: 'a.com' });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ domain: 'a.com' });
    expect(site.cbid).toBe('gen');
  });

  it('get encodes the cbid into the path', async () => {
    const { fc, calls } = client([{ json: { cbid: 'a b', orgId: 'o', domain: 'a.com' } }]);
    await fc.sites.get('a b');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a%20b');
  });

  it('delete uses DELETE', async () => {
    const { fc, calls } = client([{ status: 204 }]);
    await fc.sites.delete('a');
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a');
  });

  it('getConfig + putConfig', async () => {
    const { fc, calls } = client([{ json: { cbid: 'a' } }, { json: { cbid: 'a', banner: {} } }]);
    await fc.sites.getConfig('a');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/config');
    await fc.sites.putConfig('a', { banner: { layout: 'bottom' } });
    expect(calls[1]!.method).toBe('PUT');
    expect(calls[1]!.body).toEqual({ banner: { layout: 'bottom' } });
  });
});

describe('consent', () => {
  it('stats serializes from/to query params', async () => {
    const { fc, calls } = client([{ json: [] }]);
    await fc.consent.stats('a', { from: 100, to: 200 });
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/consent/stats?from=100&to=200');
  });

  it('log serializes limit', async () => {
    const { fc, calls } = client([{ json: [] }]);
    await fc.consent.log('a', { limit: 50 });
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/consent/export'.replace('export', 'log') + '?limit=50');
  });

  it('export returns raw CSV text', async () => {
    const { fc, calls } = client([{ text: 'stamp,region\n', contentType: 'text/csv' }]);
    const csv = await fc.consent.export('a');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/consent/export');
    expect(csv).toBe('stamp,region\n');
  });

  it('receipt', async () => {
    const { fc, calls } = client([{ json: { receipt: {} } }]);
    await fc.consent.receipt('a', 'stamp1');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/receipt/stamp1');
  });

  it('consent.eraseSubject POSTs to the erase-consent endpoint', async () => {
    const { fc, calls } = client([{ json: { erased: 3 } }]);
    const r = await fc.consent.eraseSubject('cb-1', 'st-1');
    expect(r.erased).toBe(3);
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/cb-1/erase-consent');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ stamp: 'st-1' });
  });

  it('consent.exportSubject GETs the subject-export endpoint with stamp as query param', async () => {
    const { fc, calls } = client([{ json: { cbid: 'cb-1', stamp: 'st-1', records: [], count: 0 } }]);
    const r = await fc.consent.exportSubject('cb-1', 'st-1');
    expect(r.count).toBe(0);
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/cb-1/subject-export?stamp=st-1');
    expect(calls[0]!.method).toBe('GET');
  });

  it('consent.exportSubject percent-encodes special characters in cbid and stamp', async () => {
    const { fc, calls } = client([{ json: { cbid: 'cb-1', stamp: 'st+1/a=', records: [], count: 0 } }]);
    await fc.consent.exportSubject('cb-1', 'st+1/a=');
    expect(calls[0]!.url).toContain('stamp=st%2B1%2Fa%3D');
    expect(calls[0]!.url).toContain('/sites/cb-1/');
  });
});

describe('dsar', () => {
  it('list / create / advance', async () => {
    const { fc, calls } = client([
      { json: [] },
      { status: 201, json: { request: { id: 'd1' } } },
      { json: { request: { id: 'd1', status: 'verifying' } } },
    ]);
    await fc.dsar.list();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/dsar');

    const created = await fc.dsar.create({ type: 'access', subjectEmail: 's@x.com', regulation: 'gdpr' });
    expect(calls[1]!.method).toBe('POST');
    expect(created.request.id).toBe('d1');

    await fc.dsar.advance('d1', 'verifying');
    expect(calls[2]!.url).toBe('https://api.example.com/v1/dsar/d1/advance');
    expect(calls[2]!.body).toEqual({ toStatus: 'verifying' });
  });
});

describe('governance', () => {
  it('vendors list / create', async () => {
    const { fc, calls } = client([{ json: [] }, { status: 201, json: { vendor: { id: 'v1' }, risk: { score: 0, band: 'low' } } }]);
    await fc.vendors.list();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/vendors');
    await fc.vendors.create({ name: 'Acme' } as never);
    expect(calls[1]!.method).toBe('POST');
  });

  it('ropa list / create', async () => {
    const { fc, calls } = client([{ json: [] }, { status: 201, json: { entry: { id: 'r1' } } }]);
    await fc.ropa.list();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/ropa');
    await fc.ropa.create({ name: 'X' } as never);
    expect(calls[1]!.method).toBe('POST');
  });
});

describe('site cookies / scan / ab', () => {
  it('cookies GETs the cookies path', async () => {
    const { fc, calls } = client([{ json: [{ name: '_ga', domain: 'a.com', category: 'statistics' }] }]);
    const cookies = await fc.sites.cookies('a');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/cookies');
    expect(cookies[0]!.name).toBe('_ga');
  });

  it('scan POSTs and scanStatus GETs the same path', async () => {
    const { fc, calls } = client([
      { status: 202, json: { scanId: 's1', status: 'queued' } },
      { json: { scanId: 's1', status: 'complete' } },
    ]);
    const started = await fc.sites.scan('a');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/scan');
    expect(started.status).toBe('queued');
    const done = await fc.sites.scanStatus('a');
    expect(calls[1]!.method).toBe('GET');
    expect(calls[1]!.url).toBe('https://api.example.com/v1/sites/a/scan');
    expect(done.status).toBe('complete');
  });

  it('ab GETs the ab path', async () => {
    const { fc, calls } = client([{ json: [{ variant: 'A', impressions: 10, optIn: 5, optOut: 5, optInRate: 0.5 }] }]);
    const results = await fc.sites.ab('a');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/ab');
    expect(results[0]!.variant).toBe('A');
  });

  it('snippet GETs the snippet path and returns the shape', async () => {
    const snip = {
      snippet: '<script id="CookieMunch"\n  src="https://cmp.example.com/consent.js"\n  data-cbid="a"\n  data-blockingmode="auto"></script>',
      src: 'https://cmp.example.com/consent.js',
      cbid: 'a',
      blockingMode: 'auto',
    };
    const { fc, calls } = client([{ json: snip }]);
    const result = await fc.sites.snippet('a');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/snippet');
    expect(result.cbid).toBe('a');
    expect(result.blockingMode).toBe('auto');
    expect(result.snippet).toContain('consent.js');
  });

  it('snippet passes blockingMode and culture as query params', async () => {
    const { fc, calls } = client([{ json: { snippet: '', src: '', cbid: 'a', blockingMode: 'manual' } }]);
    await fc.sites.snippet('a', { blockingMode: 'manual', culture: 'fr' });
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/snippet?blockingmode=manual&culture=fr');
  });

  it('verify POSTs to the verify endpoint with method', async () => {
    const { fc, calls } = client([{ json: { verified: true, method: 'dns' } }]);
    const result = await fc.sites.verify('a', 'dns');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/verify');
    expect(calls[0]!.body).toEqual({ method: 'dns' });
    expect(result.verified).toBe(true);
  });

  it('brand POSTs to the brand endpoint', async () => {
    const { fc, calls } = client([{ json: { suggestion: { highlight: '#ff0000', background: '#ffffff' } } }]);
    const result = await fc.sites.brand('a');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/sites/a/brand');
    expect(calls[0]!.body).toEqual({});
    expect(result.suggestion.highlight).toBe('#ff0000');
  });
});

describe('org resources', () => {
  it('brandKits / preferences / members / usage', async () => {
    const { fc, calls } = client([
      { json: [{ id: 'bk1', orgId: 'o', name: 'Kit', createdAt: 0 }] },
      { json: [] },
      { json: [] },
      { json: { orgId: 'o', plan: 'free', period: { from: 0, to: 1 }, consents: 3, sites: 1 } },
    ]);
    await fc.brandKits.list();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/brand-kits');
    await fc.preferences.list();
    expect(calls[1]!.url).toBe('https://api.example.com/v1/preferences');
    await fc.members.list();
    expect(calls[2]!.url).toBe('https://api.example.com/v1/members');
    const usage = await fc.usage();
    expect(calls[3]!.url).toBe('https://api.example.com/v1/usage');
    expect(usage.consents).toBe(3);
  });

  it('keys list / issue', async () => {
    const { fc, calls } = client([
      { json: [{ id: 'k1', orgId: 'o', prefix: 'fck_a', createdAt: 0 }] },
      { status: 201, json: { id: 'k2', orgId: 'o', prefix: 'fck_b', createdAt: 0, secret: 'fck_secret' } },
    ]);
    await fc.keys.list();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/keys');
    const issued = await fc.keys.issue({ name: 'CI' });
    expect(calls[1]!.method).toBe('POST');
    expect(calls[1]!.body).toEqual({ name: 'CI' });
    expect(issued.secret).toBe('fck_secret');
  });
});

describe('webhooks', () => {
  it('list / create / delete', async () => {
    const { fc, calls } = client([
      { json: [] },
      { status: 201, json: { id: 'w1', orgId: 'o', url: 'https://x.com/h', secret: 'whsec', events: ['consent.created'], cbid: null, active: true, createdAt: 0 } },
      { status: 204 },
    ]);
    await fc.webhooks.list();
    expect(calls[0]!.url).toBe('https://api.example.com/v1/webhooks');

    const sub = await fc.webhooks.create({ url: 'https://x.com/h', events: ['consent.created'] });
    expect(calls[1]!.method).toBe('POST');
    expect(calls[1]!.body).toEqual({ url: 'https://x.com/h', events: ['consent.created'] });
    expect(sub.secret).toBe('whsec');

    await fc.webhooks.delete('w1');
    expect(calls[2]!.method).toBe('DELETE');
    expect(calls[2]!.url).toBe('https://api.example.com/v1/webhooks/w1');
  });
});

// Task 4 — write operations on the API-key surface
describe('member writes', () => {
  it('invite POSTs to /v1/members with email + role', async () => {
    const { fc, calls } = client([{ status: 201, json: { member: { userId: 'u1', email: 'new@x.com', role: 'member' } } }]);
    const res = await fc.members.invite('new@x.com', 'member');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/members');
    expect(calls[0]!.body).toEqual({ email: 'new@x.com', role: 'member' });
    expect(res.member.email).toBe('new@x.com');
  });

  it('setRole PATCHes /v1/members/:userId with { role }', async () => {
    const { fc, calls } = client([{ json: { member: { userId: 'u1', email: 'x@x.com', role: 'admin' } } }]);
    await fc.members.setRole('u1', 'admin');
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/members/u1');
    expect(calls[0]!.body).toEqual({ role: 'admin' });
  });

  it('remove DELETEs /v1/members/:userId', async () => {
    const { fc, calls } = client([{ json: { ok: true } }]);
    await fc.members.remove('u1');
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/members/u1');
  });
});

describe('brand-kit writes', () => {
  it('brandKits.create POSTs to /v1/brand-kits', async () => {
    const kit = { id: 'bk1', orgId: 'o1', name: 'My Kit', theme: { bg: '#fff' }, createdAt: 0 };
    const { fc, calls } = client([{ status: 201, json: { kit } }]);
    const res = await fc.brandKits.create({ name: 'My Kit', theme: { bg: '#fff' } });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/brand-kits');
    expect(calls[0]!.body).toEqual({ name: 'My Kit', theme: { bg: '#fff' } });
    expect(res.kit.name).toBe('My Kit');
  });

  it('brandKits.delete DELETEs /v1/brand-kits/:id', async () => {
    const { fc, calls } = client([{ status: 204 }]);
    await fc.brandKits.delete('bk1');
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/brand-kits/bk1');
  });
});

describe('preference writes', () => {
  it('preferences.save POSTs to /v1/preferences with subjectId + purposes', async () => {
    const { fc, calls } = client([{ json: { record: { subjectId: 'u1', purposes: { newsletter: true } } } }]);
    await fc.preferences.save('u1', { newsletter: true });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/preferences');
    expect(calls[0]!.body).toEqual({ subjectId: 'u1', purposes: { newsletter: true } });
  });
});

describe('banners', () => {
  it('list GETs /v1/banners', async () => {
    const { fc, calls } = client([{ json: [{ id: 'b1', name: 'Main', updatedAt: 0, assignedCbids: [] }] }]);
    const banners = await fc.banners.list();
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/banners');
    expect(banners[0]!.id).toBe('b1');
  });

  it('create POSTs to /v1/banners with { name, json }', async () => {
    const record = { id: 'b1', orgId: 'o1', name: 'Main', json: { banner: {} }, createdAt: 0, updatedAt: 0 };
    const { fc, calls } = client([{ status: 201, json: record }]);
    const res = await fc.banners.create({ name: 'Main', json: { banner: {} } as never });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/banners');
    expect(calls[0]!.body).toEqual({ name: 'Main', json: { banner: {} } });
    expect(res.id).toBe('b1');
  });

  it('get GETs /v1/banners/:id, encoding the id', async () => {
    const record = { id: 'b 1', orgId: 'o1', name: 'Main', json: {}, createdAt: 0, updatedAt: 0 };
    const { fc, calls } = client([{ json: record }]);
    await fc.banners.get('b 1');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/banners/b%201');
  });

  it('update PUTs to /v1/banners/:id with the patch', async () => {
    const record = { id: 'b1', orgId: 'o1', name: 'New Name', json: {}, createdAt: 0, updatedAt: 1 };
    const { fc, calls } = client([{ json: record }]);
    const res = await fc.banners.update('b1', { name: 'New Name' });
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/banners/b1');
    expect(calls[0]!.body).toEqual({ name: 'New Name' });
    expect(res.name).toBe('New Name');
  });

  it('delete DELETEs /v1/banners/:id and returns void', async () => {
    const { fc, calls } = client([{ status: 204 }]);
    const res = await fc.banners.delete('b1');
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/banners/b1');
    expect(res).toBeUndefined();
  });

  it('assignments GETs /v1/banners/:id/assignments', async () => {
    const { fc, calls } = client([{ json: { cbids: ['a', 'b'] } }]);
    const res = await fc.banners.assignments('b1');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/banners/b1/assignments');
    expect(res.cbids).toEqual(['a', 'b']);
  });

  it('setAssignments PUTs to /v1/banners/:id/assignments with { cbids }', async () => {
    const { fc, calls } = client([{ json: { cbids: ['a'] } }]);
    const res = await fc.banners.setAssignments('b1', ['a']);
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/banners/b1/assignments');
    expect(calls[0]!.body).toEqual({ cbids: ['a'] });
    expect(res.cbids).toEqual(['a']);
  });

  it('publish POSTs to /v1/banners/:id/publish', async () => {
    const { fc, calls } = client([{ json: { publishedCbids: ['a', 'b'] } }]);
    const res = await fc.banners.publish('b1');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/v1/banners/b1/publish');
    expect(res.publishedCbids).toEqual(['a', 'b']);
  });
});

describe('error handling', () => {
  it('throws a typed CookieMunchApiError on non-2xx', async () => {
    const { fc } = client([{ status: 404, json: { error: 'site not found' } }]);
    await expect(fc.sites.get('nope')).rejects.toBeInstanceOf(CookieMunchApiError);
    try {
      await client([{ status: 401, json: { error: 'invalid API key' } }]).fc.me();
      expect.unreachable();
    } catch (e) {
      const err = e as CookieMunchApiError;
      expect(err.status).toBe(401);
      expect(err.message).toBe('invalid API key');
    }
  });

  it('error carries status even when body is not JSON', async () => {
    const { fc } = client([{ status: 500, text: 'boom', contentType: 'text/plain' }]);
    await expect(fc.me()).rejects.toMatchObject({ status: 500 });
  });
});
