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
