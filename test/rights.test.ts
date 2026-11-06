/**
 * createRightsHandlers (Calendoro #13): the cm-standard-v2 contract from callbacks. It passes the
 * conformance kit with nothing but a lookup, hides itself from a caller without the key, replays
 * Idempotency-Key, refuses forged request ids, and never erases before executeAfter or after a cancel.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRightsHandlers, fileStore, sqlStore, redisStore, RIGHTS_STORE_TABLE_SQL, type RightsHandlersOptions } from '../src/rights.js';
import { runExecutorConformance, CONFORMANCE_RULES } from '../src/executor-conformance.js';

const key = 'sk_exec_0123456789abcdef';
const idSecret = 'id-secret-0123456789abcdef0123456789';
const canaryEmail = 'canary-0123456789abcdef@canary.cookiemunch.net';
const T0 = Date.UTC(2026, 10, 1);
const base = 'https://app.example/privacy';

function make(extra: Partial<RightsHandlersOptions> = {}, clock = { t: T0 }) {
  const erased: string[] = [];
  const opts: RightsHandlersOptions = {
    key,
    idSecret,
    now: () => clock.t,
    lookup: ({ emails, identity }) => (identity ? (identity.sub === 'user_ana' ? 'u1' : null) : emails.includes('ana@example.com') ? 'u1' : null),
    access: () => ({ status: 'completed', result: { downloadUrl: 'https://app.example/x', expiresAt: '2026-11-02T00:00:00Z', sha256: 'ab' } }),
    erase: (r) => {
      erased.push(r.subjectId);
    },
    ...extra,
  };
  const h = createRightsHandlers(opts);
  let n = 0;
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    h.fetch(
      new Request(base + path, {
        method,
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'idempotency-key': `case-1:conn-1:op-${++n}`,
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { h, call, erased, clock };
}

describe('createRightsHandlers', () => {
  it('passes every conformance rule with only a lookup and an erase', async () => {
    const { h } = make();
    const fetchVia = ((input: string | URL | Request, init?: RequestInit) => h.fetch(new Request(input, init))) as typeof fetch;
    const r = await runExecutorConformance({ baseUrl: 'https://app.example', secret: key, canaryEmail, runId: 'run1', now: () => T0, fetch: fetchVia });
    expect(r.rules.filter((x) => x.status === 'fail')).toEqual([]);
    expect(r).toMatchObject({ ok: true, passed: CONFORMANCE_RULES.length, version: '2' });
  });

  it('answers a missing or wrong key with a bare 404: no X-Version, no contract body', async () => {
    const { h } = make();
    for (const authorization of [undefined, 'Bearer nope', `Bearer ${key}x`, key]) {
      const res = await h.fetch(new Request(`${base}/lookup`, { method: 'POST', headers: authorization ? { authorization } : {}, body: '{"emails":[]}' }));
      expect(res.status).toBe(404);
      expect(res.headers.get('x-version')).toBeNull();
      expect(await res.text()).toBe('Not Found');
    }
  });

  it('puts X-Version and Cache-Control: no-store on authorised answers, and no_match is a 200', async () => {
    const { call } = make();
    const res = await call('POST', '/lookup', { emails: ['nobody@example.com'] });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-version')).toBe('2');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ subjectId: null, status: 'no_match' });
    expect(await (await call('POST', '/lookup', { emails: ['ana@example.com'] })).json()).toEqual({ subjectId: 'u1', status: 'found' });
  });

  it('accepts the identity as `atlas` too, and validates the lookup body', async () => {
    const { call } = make();
    expect(await (await call('POST', '/lookup', { emails: [], atlas: { iss: 'https://id.example', sub: 'user_ana' } })).json()).toEqual({ subjectId: 'u1', status: 'found' });
    const bad = await call('POST', '/lookup', { emails: 'ana@example.com' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ field: 'emails' });
    expect((await call('POST', '/lookup', { emails: [], identity: { sub: 'x' } })).status).toBe(400);
  });

  it('never hands the canary to the product lookup', async () => {
    const lookup = vi.fn(() => 'u1');
    const { call } = make({ lookup });
    expect(await (await call('POST', '/lookup', { emails: [canaryEmail] })).json()).toEqual({ subjectId: 'canary_0123456789abcdef', status: 'found' });
    expect(await (await call('POST', '/lookup', { emails: [canaryEmail], identity: { iss: 'https://id.example', sub: 'someone' } })).json()).toEqual({ subjectId: null, status: 'no_match' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('runs an access at once and returns its result', async () => {
    const { call } = make();
    const res = await call('POST', '/requests', { subjectId: 'u1', type: 'export', caseId: 'case-1' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ type: 'export', canonicalType: 'access', status: 'completed', result: { sha256: 'ab' } });
    expect(await (await call('GET', `/requests/${body.id}`)).json()).toEqual(body);
  });

  it('schedules an erasure until executeAfter, runs it on the first read after, and passes the reason', async () => {
    const seen: unknown[] = [];
    const clock = { t: T0 };
    const { call, erased } = make({ erase: (r) => { seen.push(r); erased.push(r.subjectId); } }, clock);
    const executeAfter = new Date(T0 + 3_600_000).toISOString();
    const opened = await (await call('POST', '/requests', { subjectId: 'u1', type: 'erasure', caseId: 'case-1', executeAfter, reason: 'asked by email' })).json();
    expect(opened).toMatchObject({ canonicalType: 'deletion', status: 'scheduled', eta: executeAfter });
    expect(await (await call('GET', `/requests/${opened.id}`)).json()).toMatchObject({ status: 'scheduled' });
    expect(erased).toEqual([]);
    clock.t = T0 + 3_600_000;
    expect(await (await call('GET', `/requests/${opened.id}`)).json()).toMatchObject({ status: 'completed' });
    expect(erased).toEqual(['u1']);
    expect(seen[0]).toMatchObject({ subjectId: 'u1', type: 'deletion', requestedType: 'erasure', caseId: 'case-1', reason: 'asked by email', executeAfter });
    await call('GET', `/requests/${opened.id}`);
    expect(erased).toEqual(['u1']);
  });

  it('a cancel before executeAfter leaves everything in place, and a completed request is too late to cancel', async () => {
    const clock = { t: T0 };
    const { call, erased } = make({}, clock);
    const opened = await (await call('POST', '/requests', { subjectId: 'u1', type: 'deletion', caseId: 'c', executeAfter: new Date(T0 + 1000).toISOString() })).json();
    expect(await (await call('POST', `/requests/${opened.id}/cancel`, {})).json()).toMatchObject({ status: 'cancelled' });
    clock.t = T0 + 5000;
    expect(await (await call('GET', `/requests/${opened.id}`)).json()).toMatchObject({ status: 'cancelled' });
    expect(erased).toEqual([]);
    const done = await (await call('POST', '/requests', { subjectId: 'u1', type: 'deletion', caseId: 'c' })).json();
    expect(done.status).toBe('completed');
    expect((await call('POST', `/requests/${done.id}/cancel`, {})).status).toBe(409);
  });

  it('replays an Idempotency-Key with the same body, and 409s a different body', async () => {
    const access = vi.fn(() => ({ status: 'completed' as const }));
    const { call } = make({ access });
    const k = { 'idempotency-key': 'case-9:conn-1:open' };
    const first = await (await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'case-9' }, k)).json();
    const again = await (await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'case-9' }, k)).json();
    expect(again).toEqual(first);
    expect(access).toHaveBeenCalledTimes(1);
    expect((await call('POST', '/requests', { subjectId: 'u2', type: 'access', caseId: 'case-9' }, k)).status).toBe(409);
    expect((await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'c' }, { 'idempotency-key': 'short' })).status).toBe(400);
  });

  it('uses a pluggable store', async () => {
    const store = new Map<string, string>();
    const { call } = make({ store });
    await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'c' });
    expect([...store.keys()].some((k) => k.startsWith('req:'))).toBe(true);
    expect([...store.keys()].some((k) => k.startsWith('idem:'))).toBe(true);
  });

  it('refuses forged and foreign request ids with a 404', async () => {
    const { call } = make();
    const opened = await (await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'c' })).json();
    const [v, payload, sig] = (opened.id as string).split('.');
    const forgedPayload = btoa(JSON.stringify({ s: 'u2', t: 'deletion', y: 'deletion', c: 'c', n: 'x' })).replace(/=+$/, '');
    for (const id of ['req_1', `${v}.${forgedPayload}.${sig}`, `${v}.${payload}.${sig!.slice(0, -2)}AA`]) {
      const res = await call('GET', `/requests/${encodeURIComponent(id)}`);
      expect(res.status).toBe(404);
      expect(res.headers.get('x-version')).toBe('2');
    }
    const other = createRightsHandlers({ key, idSecret: 'another-secret-0123456789abcdef01234', lookup: () => null });
    const res = await other.fetch(new Request(`${base}/requests/${opened.id}`, { headers: { authorization: `Bearer ${key}` } }));
    expect(res.status).toBe(404);
  });

  it('never acts on a genuine id whose state is gone', async () => {
    const store = new Map<string, string>();
    const clock = { t: T0 };
    const { call, erased } = make({ store }, clock);
    const opened = await (await call('POST', '/requests', { subjectId: 'u1', type: 'deletion', caseId: 'c', executeAfter: new Date(T0 + 1000).toISOString() })).json();
    store.clear();
    clock.t = T0 + 5000;
    expect(await (await call('GET', `/requests/${opened.id}`)).json()).toMatchObject({ status: 'rejected' });
    expect(erased).toEqual([]);
  });

  it('validates the request body, and a type with no callback is a 400 naming the field', async () => {
    const { call } = make();
    expect(await (await call('POST', '/requests', { subjectId: 'u1', type: 'teleport', caseId: 'c' })).json()).toMatchObject({ field: 'type' });
    expect(await (await call('POST', '/requests', { type: 'access', caseId: 'c' })).json()).toMatchObject({ field: 'subjectId' });
    expect(await (await call('POST', '/requests', { subjectId: 'u1', type: 'access' })).json()).toMatchObject({ field: 'caseId' });
    expect(await (await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'c', executeAfter: 'soon' })).json()).toMatchObject({ field: 'executeAfter' });
    expect(await (await call('POST', '/requests', { subjectId: 'u1', type: 'rectification', caseId: 'c' })).json()).toMatchObject({ field: 'type' });
  });

  it('closure falls back to erase; rejected and retention outcomes come through', async () => {
    const { call, erased } = make({
      restrict: () => ({ status: 'rejected', detail: 'the partner is still owed commissions' }),
      access: () => ({ status: 'completed_with_retention', retention: [{ category: 'payout_records', basis: 'legal_obligation', until: '2033-12-31' }] }),
    });
    expect(await (await call('POST', '/requests', { subjectId: 'u1', type: 'closure', caseId: 'c' })).json()).toMatchObject({ canonicalType: 'closure', status: 'completed' });
    expect(erased).toEqual(['u1']);
    expect(await (await call('POST', '/requests', { subjectId: 'u1', type: 'restriction', caseId: 'c' })).json()).toMatchObject({ status: 'rejected', detail: 'the partner is still owed commissions' });
    expect(await (await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'c' })).json()).toMatchObject({ status: 'completed_with_retention', retention: [{ basis: 'legal_obligation' }] });
  });

  it('reads a processing request back through `status`', async () => {
    const { call } = make({ access: () => ({ status: 'processing' }), status: () => ({ status: 'completed', result: { inline: true } }) });
    const opened = await (await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'c' })).json();
    expect(opened.status).toBe('processing');
    expect(await (await call('GET', `/requests/${opened.id}`)).json()).toMatchObject({ status: 'completed', result: { inline: true } });
  });

  it('a throwing callback is a 500 that is not replayed', async () => {
    let fail = true;
    const { call } = make({ access: () => { if (fail) throw new Error('db down'); } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const k = { 'idempotency-key': 'case-5:conn-1:open' };
    expect((await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'c' }, k)).status).toBe(500);
    fail = false;
    expect((await call('POST', '/requests', { subjectId: 'u1', type: 'access', caseId: 'c' }, k)).status).toBe(201);
  });

  it('refuses weak options at construction', () => {
    expect(() => createRightsHandlers({ key, idSecret: 'short', lookup: () => null })).toThrow(/idSecret/);
    expect(() => createRightsHandlers({ key: '', idSecret, lookup: () => null })).toThrow(/key/);
  });

  it('fileStore: a scheduled erasure survives a restart and runs on the next poll after executeAfter', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cm-rights-'));
    try {
      const clock = { t: T0 };
      const first = make({ store: fileStore(dir) }, clock);
      const opened = await (await first.call('POST', '/requests', { subjectId: 'u1', type: 'deletion', caseId: 'c', executeAfter: new Date(T0 + 3600_000).toISOString() })).json();
      expect(opened.status).toBe('scheduled');
      // "Restart": a new handler over the same directory. Nothing runs until Cookie Munch asks.
      const second = make({ store: fileStore(dir) }, clock);
      expect(await (await second.call('GET', `/requests/${opened.id}`)).json()).toMatchObject({ status: 'scheduled' });
      clock.t = T0 + 3600_000;
      expect(second.erased).toEqual([]);
      expect(await (await second.call('GET', `/requests/${opened.id}`)).json()).toMatchObject({ status: 'completed' });
      expect(second.erased).toEqual(['u1']);
      expect(first.erased).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('forgets idempotency answers after 24 hours (handler clock and fileStore TTL)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cm-rights-'));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    try {
      const access = vi.fn(() => ({ status: 'completed' as const }));
      const clock = { t: T0 };
      const store = fileStore(dir);
      const { call } = make({ access, store }, clock);
      const k = { 'idempotency-key': 'case-7:conn-1:open' };
      const body = { subjectId: 'u1', type: 'access', caseId: 'case-7' };
      await call('POST', '/requests', body, k);
      expect(await store.get('idem:case-7:conn-1:open')).toBeTruthy();
      clock.t = T0 + 24 * 3600_000 - 1;
      vi.setSystemTime(clock.t);
      await call('POST', '/requests', body, k);
      expect(access).toHaveBeenCalledTimes(1);
      clock.t = T0 + 24 * 3600_000 + 1;
      vi.setSystemTime(clock.t);
      expect(await store.get('idem:case-7:conn-1:open')).toBeNull();
      // A Map ignores the TTL; the handler's own check still forgets it, and deletes it.
      const map = new Map<string, string>();
      const m = make({ access, store: map }, { t: T0 });
      await m.call('POST', '/requests', body, k);
      m.clock.t = T0 + 24 * 3600_000;
      await m.call('POST', '/requests', { ...body, caseId: 'other' }, k);
      expect(access).toHaveBeenCalledTimes(3);
      expect(JSON.parse(map.get('idem:case-7:conn-1:open')!).at).toBe(T0 + 24 * 3600_000);
    } finally {
      vi.useRealTimers();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('sqlStore and redisStore pass the TTL through and keep request state without one', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const sql = sqlStore({ query: async (s, p) => (calls.push([s, p]), s.startsWith('SELECT') ? { rows: [{ value: 'v' }] } : []) });
    await sql.set('req:a', 'x');
    await sql.set('idem:b', 'y', { ttlSeconds: 60 });
    expect(await sql.get('req:a')).toBe('v');
    await sql.delete('idem:b');
    expect(calls.map(([s, p]) => [s.split(' ')[0], p])).toEqual([
      ['INSERT', ['req:a', 'x', null]],
      ['INSERT', ['idem:b', 'y', 60]],
      ['DELETE', []],
      ['SELECT', ['req:a']],
      ['DELETE', ['idem:b']],
    ]);
    expect(RIGHTS_STORE_TABLE_SQL).toMatch(/CREATE TABLE IF NOT EXISTS cookiemunch_rights_store/);

    const r: unknown[][] = [];
    const redis = redisStore({ get: async (k) => (r.push(['get', k]), null), set: async (...a) => r.push(['set', ...a]), del: async (k) => r.push(['del', k]) });
    await redis.set('req:a', 'x');
    await redis.set('idem:b', 'y', { ttlSeconds: 60 });
    await redis.get('req:a');
    await redis.delete('idem:b');
    expect(r).toEqual([
      ['set', 'cookiemunch:rights:req:a', 'x'],
      ['set', 'cookiemunch:rights:idem:b', 'y', { EX: 60 }],
      ['get', 'cookiemunch:rights:req:a'],
      ['del', 'cookiemunch:rights:idem:b'],
    ]);
  });

  it('exposes the same handler as fetch, GET and POST', () => {
    const h = createRightsHandlers({ key, idSecret, lookup: () => null });
    expect(h.GET).toBe(h.fetch);
    expect(h.POST).toBe(h.fetch);
  });
});

describe('createRightsHandlers completion', () => {
  const secret = `whsec_${Buffer.from('k'.repeat(32)).toString('base64')}`;
  const url = 'https://api.cookiemunch.net/v1/dsar/executors/exec_1/completions';
  function sender(answers: Array<number | Error> = []) {
    const sent: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const fetch = vi.fn(async (u: string, init: RequestInit) => {
      sent.push({ url: u, headers: init.headers as Record<string, string>, body: init.body as string });
      const a = answers.shift() ?? 204;
      if (a instanceof Error) throw a;
      return new Response(null, { status: a });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, sent };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  // Web Crypto settles off the microtask queue, so step fake time until the condition holds.
  async function stepUntil(done: () => boolean) {
    // By the clock, not a count of ticks: signing runs on a thread pool, which a loaded runner can leave behind 200 ticks.
    for (const end = Date.now() + 4_000; !done() && Date.now() < end; ) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(500);
    }
  }

  it('pushes a final status inline, signed the Standard Webhooks way over the decoded whsec_ key', async () => {
    const { createHmac } = await import('node:crypto');
    const s = sender();
    const { call } = make({ completion: { url, secret, fetch: s.fetch } });
    const opened = (await (await call('POST', '/requests', { type: 'export', subjectId: 'u1', caseId: 'case_9' })).json()) as { id: string };
    await flush();
    expect(s.sent).toHaveLength(1);
    const { headers, body } = s.sent[0]!;
    expect(s.sent[0]!.url).toBe(url);
    expect(headers['webhook-timestamp']).toBe(String(Math.floor(T0 / 1000)));
    expect(headers['webhook-id']).toMatch(/^[A-Za-z0-9._:-]{1,200}$/);
    const expected = createHmac('sha256', Buffer.from('k'.repeat(32))).update(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${body}`).digest('base64');
    expect(headers['webhook-signature']).toBe(`v1,${expected}`);
    expect(JSON.parse(body)).toMatchObject({ caseId: 'case_9', request: { id: opened.id, type: 'export', canonicalType: 'access', status: 'completed' } });
  });

  it('a pending request sends nothing until handlers.complete, which sends once', async () => {
    const s = sender();
    const { h, call } = make({ completion: { url, secret, fetch: s.fetch }, erase: () => ({ status: 'pending' }) });
    const { id } = (await (await call('POST', '/requests', { type: 'erasure', subjectId: 'u1', caseId: 'c' })).json()) as { id: string };
    await flush();
    expect(s.sent).toHaveLength(0);
    expect(await h.complete(id, { status: 'completed_with_retention', retention: [{ category: 'invoices', basis: 'legal_obligation' }] })).toEqual({ status: 'completed_with_retention', delivered: true });
    expect(JSON.parse(s.sent[0]!.body).request.retention).toHaveLength(1);
    // Already delivered: a second complete (or a read) sends nothing more.
    expect(await h.complete(id)).toEqual({ status: 'completed_with_retention', delivered: false });
    expect(((await (await call('GET', `/requests/${encodeURIComponent(id)}`)).json()) as { status: string }).status).toBe('completed_with_retention');
    await flush();
    expect(s.sent).toHaveLength(1);
    await expect(h.complete('r1.forged.sig')).rejects.toThrow(/not a request id/);
  });

  it('a scheduled erasure that runs on the poll, and a cancel, are pushed too', async () => {
    const s = sender();
    const clock = { t: T0 };
    const { call } = make({ completion: { url, secret, fetch: s.fetch } }, clock);
    const later = new Date(T0 + 60_000).toISOString();
    const a = (await (await call('POST', '/requests', { type: 'erasure', subjectId: 'u1', caseId: 'c1', executeAfter: later })).json()) as { id: string };
    const b = (await (await call('POST', '/requests', { type: 'erasure', subjectId: 'u1', caseId: 'c2', executeAfter: later })).json()) as { id: string };
    await flush();
    expect(s.sent).toHaveLength(0);
    await call('POST', `/requests/${encodeURIComponent(b.id)}/cancel`);
    clock.t += 60_000;
    await call('GET', `/requests/${encodeURIComponent(a.id)}`);
    // The pushes are fire-and-forget (signing is async): wait for both rather than a fixed number of ticks.
    await vi.waitFor(() => expect(s.sent).toHaveLength(2));
    expect(s.sent.map((x) => JSON.parse(x.body).request.status).sort()).toEqual(['cancelled', 'completed']);
  });

  it('retries a 5xx with the same Webhook-Id, and a network error never reaches the request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const s = sender([503, new Error('ECONNRESET'), 204]);
      const { h, call } = make({ completion: { url, secret, fetch: s.fetch }, erase: () => ({ status: 'processing' }) });
      const { id } = (await (await call('POST', '/requests', { type: 'erasure', subjectId: 'u1', caseId: 'c' })).json()) as { id: string };
      let result: unknown;
      void h.complete(id).then((r) => (result = r));
      await stepUntil(() => result !== undefined);
      expect(result).toEqual({ status: 'completed', delivered: true });
      expect(s.sent).toHaveLength(3);
      expect(new Set(s.sent.map((x) => x.headers['webhook-id'])).size).toBe(1);

      const down = sender([new Error('down'), new Error('down'), new Error('down')]);
      const h2 = make({ completion: { url, secret, fetch: down.fetch } });
      const res = await h2.call('POST', '/requests', { type: 'export', subjectId: 'u1', caseId: 'c' });
      expect(res.status).toBe(201);
      await stepUntil(() => down.sent.length === 3);
      expect(down.sent).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a completion without url or secret at construction', () => {
    expect(() => make({ completion: { url: '', secret } })).toThrow(/completion/);
    expect(() => make({ completion: { url, secret: '' } })).toThrow(/completion/);
  });
});

describe('the erase rule (eraseSubjectEmail)', () => {
  const via = (h: ReturnType<typeof make>['h']) => ((input: string | URL | Request, init?: RequestInit) => h.fetch(new Request(input, init))) as typeof fetch;
  const opts = { baseUrl: 'https://app.example', secret: key, canaryEmail, runId: 'run1', now: () => T0 };
  const seeded = (doErase: boolean) => {
    const people = new Set(['throwaway@example.com']);
    const erased: string[] = [];
    const { h } = make({
      lookup: ({ emails }: { emails: string[] }) => (emails.some((e) => people.has(e)) ? 'u_throwaway' : null),
      erase: (r: { subjectId: string }) => { erased.push(r.subjectId); if (doErase) people.clear(); return { status: 'completed' as const }; },
    } as never);
    return { h, erased };
  };

  it('runs your erase code and passes when the subject is gone', async () => {
    const { h, erased } = seeded(true);
    const r = await runExecutorConformance({ ...opts, fetch: via(h), eraseSubjectEmail: 'throwaway@example.com' });
    expect(erased).toEqual(['u_throwaway']);
    expect(r.rules.find((x) => x.id === 'requests.erase.removes_subject')?.status).toBe('pass');
    expect(r.ok).toBe(true);
  });

  it('fails an erase that says completed and leaves the subject', async () => {
    const r = await runExecutorConformance({ ...opts, fetch: via(seeded(false).h), eraseSubjectEmail: 'throwaway@example.com' });
    expect(r.rules.find((x) => x.id === 'requests.erase.removes_subject')).toMatchObject({ status: 'fail', detail: expect.stringMatching(/a lookup afterwards/) });
    expect(r.ok).toBe(false);
  });

  it('fails when the subject was not seeded, erasing nothing', async () => {
    const { h, erased } = seeded(true);
    const r = await runExecutorConformance({ ...opts, fetch: via(h), eraseSubjectEmail: 'nobody@example.com' });
    expect(r.rules.find((x) => x.id === 'requests.erase.removes_subject')).toMatchObject({ status: 'fail', detail: expect.stringMatching(/must exist/) });
    expect(erased).toEqual([]);
  });

  it('touches nothing real without the option, and refuses the canary as the subject', async () => {
    const { h, erased } = seeded(true);
    const r = await runExecutorConformance({ ...opts, fetch: via(h) });
    expect(erased).toEqual([]);
    expect(r.rules.some((x) => x.id === 'requests.erase.removes_subject')).toBe(false);
    await expect(runExecutorConformance({ ...opts, fetch: via(h), eraseSubjectEmail: canaryEmail })).rejects.toThrow(/throwaway/);
  });
});
