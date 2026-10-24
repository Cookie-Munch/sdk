/**
 * The cm-standard-v2 executor conformance kit (CMU-X20).
 *
 * cm-standard-v2 is an open contract: any system that holds personal data can implement it and
 * be driven by Cookie Munch with no code on our side (docs: cookiemunch.net/docs/executor-contract-v2).
 * This kit checks an implementation rule by rule, and names the rule that fails. It is the same
 * suite Cookie Munch runs on `POST /v1/dsar/executors/{id}/test {conformance: true}`, and the
 * `cookiemunch executors conformance <baseUrl>` command runs it from a terminal or CI.
 *
 * It only ever touches the CANARY subject — an address no real person has. The contract asks every
 * implementation to treat the canary as an existing synthetic person: it is found by its email and
 * by its identity, requests on it move through the full state machine, and nothing real is ever
 * erased. So the kit can check that an erasure waits for `executeAfter`, that a cancel leaves the
 * person in place, and that an identity is never matched to someone else through a shared email —
 * without a real person's data being anywhere near it.
 *
 * No dependencies: `fetch` only, so it runs in Node 18+, a browser, or an edge runtime.
 */

export type ConformanceStatus = 'pass' | 'fail' | 'skip';

export interface ConformanceRuleResult {
  /** A stable id, e.g. `requests.execute_after.scheduled`. */
  id: string;
  /** What the rule says, in one sentence. */
  title: string;
  status: ConformanceStatus;
  /** What was seen, when it failed or was skipped. */
  detail?: string;
}

export interface ConformanceReport {
  /** True when no rule failed. */
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  rules: ConformanceRuleResult[];
  /** The `X-Version` the executor answered with, when it sent one. */
  version?: string;
}

export interface ConformanceOptions {
  /** The executor's base: the contract paths are `{baseUrl}/privacy/lookup` and so on. https (http only for localhost). */
  baseUrl: string;
  /** The credential Cookie Munch would send. */
  secret: string;
  /**
   * The canary address: `canary-<16 hex>@canary.cookiemunch.net`, per organisation
   * (`GET /v1/dsar/executors/presets` → `canaryEmail`).
   */
  canaryEmail: string;
  /** How the secret is sent. Default `Authorization: Bearer {secret}`. */
  auth?: { header: string; format: string };
  /** Path prefix under baseUrl. Default `/privacy`. */
  prefix?: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** A per-run tag for idempotency keys and case ids. Default random. */
  runId?: string;
}

/** The issuer the canary identity carries. */
export const CANARY_ISSUER = 'https://canary.cookiemunch.net';
const CANARY_EMAIL_RE = /^canary-([0-9a-f]{16})@canary\.cookiemunch\.net$/;

/** The canary subject's identity, derived from its address. */
export function canaryIdentityFor(canaryEmail: string): { iss: string; sub: string; ext: string } {
  const m = CANARY_EMAIL_RE.exec(canaryEmail.trim().toLowerCase());
  if (!m) throw new Error('canaryEmail must be the canary address canary-<16 hex>@canary.cookiemunch.net');
  return { iss: CANARY_ISSUER, sub: `canary_${m[1]}`, ext: `canary:${m[1]}` };
}

/** Every rule, in the order they run. */
export const CONFORMANCE_RULES: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'auth.required', title: 'A request without the credential is refused (401 or 403).' },
  { id: 'lookup.email.found', title: 'The canary subject is found by its email.' },
  { id: 'lookup.identity.found', title: 'The canary subject is found by its identity alone (iss + sub), and it is the same subject.' },
  { id: 'lookup.unknown.no_match', title: 'An address nobody has answers { subjectId: null, status: "no_match" }.' },
  { id: 'lookup.identity_beats_email', title: 'An identity that matches no one is never matched through the email of someone else.' },
  { id: 'requests.bad_body.400', title: 'A request with an unknown type answers 400 { error, field }.' },
  { id: 'requests.alias.canonical_type', title: 'An alias (erasure) is accepted and answered with canonicalType "deletion".' },
  { id: 'requests.execute_after.scheduled', title: 'A deletion with a future executeAfter is "scheduled" with eta equal to executeAfter — nothing is deleted before it.' },
  { id: 'requests.idempotency.replay', title: 'The same Idempotency-Key with the same body returns the same request, not a second one.' },
  { id: 'requests.idempotency.mismatch_409', title: 'The same Idempotency-Key with a different body answers 409.' },
  { id: 'requests.get', title: 'GET /privacy/requests/{id} returns the request, still scheduled.' },
  { id: 'requests.unknown.404', title: 'An unknown request id answers 404.' },
  { id: 'requests.cancel.before_execute_after', title: 'A cancel before executeAfter answers status "cancelled".' },
  { id: 'requests.cancel.keeps_data', title: 'After a cancel the subject is still there: a lookup finds it.' },
  { id: 'version.header', title: 'Answers carry X-Version (the highest contract version the executor supports).' },
];

type Answer = { status: number; json: unknown; version: string | null; error?: string };

function randomTag(): string {
  const bytes = new Uint8Array(8);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function field(json: unknown, key: string): unknown {
  return json && typeof json === 'object' ? (json as Record<string, unknown>)[key] : undefined;
}

/** Run every rule against one executor. Never throws for an executor's answer; only for bad options. */
export async function runExecutorConformance(o: ConformanceOptions): Promise<ConformanceReport> {
  const doFetch = o.fetch ?? fetch;
  const now = o.now ?? (() => Date.now());
  const base = o.baseUrl.replace(/\/+$/, '') + (o.prefix ?? '/privacy');
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error('baseUrl must be an absolute URL');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))) {
    throw new Error('baseUrl must be https (http only for localhost)');
  }
  const identity = canaryIdentityFor(o.canaryEmail);
  const canaryEmail = o.canaryEmail.trim().toLowerCase();
  const auth = o.auth ?? { header: 'Authorization', format: 'Bearer {secret}' };
  const run = o.runId ?? randomTag();
  const results = new Map<string, ConformanceRuleResult>();
  let version: string | undefined;

  const set = (id: string, status: ConformanceStatus, detail?: string): void => {
    const rule = CONFORMANCE_RULES.find((r) => r.id === id)!;
    results.set(id, { id, title: rule.title, status, ...(detail ? { detail } : {}) });
  };
  const pass = (id: string) => set(id, 'pass');
  const fail = (id: string, detail: string) => set(id, 'fail', detail);
  const skip = (id: string, detail: string) => set(id, 'skip', detail);

  async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}, withAuth = true): Promise<Answer> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'X-Version': '2',
      ...(withAuth ? { [auth.header]: auth.format.replace('{secret}', o.secret) } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...extra,
    };
    try {
      const res = await doFetch(base + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const text = await res.text().catch(() => '');
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      const v = res.headers.get('x-version');
      if (v && !version) version = v;
      return { status: res.status, json, version: v };
    } catch (err) {
      return { status: 0, json: undefined, version: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
  const said = (a: Answer): string => (a.status === 0 ? `unreachable: ${a.error}` : `HTTP ${a.status} ${JSON.stringify(a.json ?? null).slice(0, 200)}`);
  const key = (rule: string) => `conformance:${run}:${rule}`;

  // auth.required
  const anon = await call('POST', '/lookup', { emails: [canaryEmail] }, {}, false);
  if (anon.status === 0) {
    // Nothing else can be judged against a system we cannot reach.
    for (const r of CONFORMANCE_RULES) skip(r.id, said(anon));
    fail('auth.required', said(anon));
    return report();
  }
  if (anon.status === 401 || anon.status === 403) pass('auth.required');
  else fail('auth.required', `without a credential: ${said(anon)}`);

  // lookups
  const byEmail = await call('POST', '/lookup', { emails: [canaryEmail] }, { 'Idempotency-Key': key('lookup-email') });
  const subjectId = field(byEmail.json, 'subjectId');
  if (byEmail.status === 200 && field(byEmail.json, 'status') === 'found' && typeof subjectId === 'string' && subjectId) pass('lookup.email.found');
  else fail('lookup.email.found', `the canary address: ${said(byEmail)}`);

  const byIdentity = await call('POST', '/lookup', { emails: [], identity: identity, atlas: identity }, { 'Idempotency-Key': key('lookup-identity') });
  if (byIdentity.status === 200 && field(byIdentity.json, 'status') === 'found' && field(byIdentity.json, 'subjectId') === subjectId && typeof subjectId === 'string') {
    pass('lookup.identity.found');
  } else {
    fail('lookup.identity.found', `the canary identity ${identity.sub}: ${said(byIdentity)}${typeof subjectId === 'string' ? ` (by email it was ${subjectId})` : ''}`);
  }

  const nobody = await call('POST', '/lookup', { emails: [`nobody-${run}@canary.cookiemunch.net`] }, { 'Idempotency-Key': key('lookup-nobody') });
  if (nobody.status === 200 && field(nobody.json, 'status') === 'no_match' && field(nobody.json, 'subjectId') === null) pass('lookup.unknown.no_match');
  else fail('lookup.unknown.no_match', said(nobody));

  const stranger = { iss: identity.iss, sub: `canary_other_${run}` };
  const crossed = await call('POST', '/lookup', { emails: [canaryEmail], identity: stranger, atlas: stranger }, { 'Idempotency-Key': key('lookup-crossed') });
  if (crossed.status === 200 && field(crossed.json, 'status') === 'no_match') pass('lookup.identity_beats_email');
  else {
    fail(
      'lookup.identity_beats_email',
      `an identity nobody has (${stranger.sub}) with the canary's email: ${said(crossed)} — the email belongs to a different identity, so this must be no_match`,
    );
  }

  // requests
  const bad = await call('POST', '/requests', { subjectId: subjectId ?? 'x', type: 'teleport', caseId: `conformance-${run}` }, { 'Idempotency-Key': key('bad-body') });
  if (bad.status === 400 && typeof field(bad.json, 'error') === 'string' && typeof field(bad.json, 'field') === 'string') pass('requests.bad_body.400');
  else fail('requests.bad_body.400', said(bad));

  if (typeof subjectId !== 'string') {
    for (const id of ['requests.alias.canonical_type', 'requests.execute_after.scheduled', 'requests.idempotency.replay', 'requests.idempotency.mismatch_409', 'requests.get', 'requests.cancel.before_execute_after', 'requests.cancel.keeps_data']) {
      skip(id, 'needs the canary subject, which the lookup did not find');
    }
  } else {
    const executeAfter = new Date(Math.ceil((now() + 3_600_000) / 1000) * 1000).toISOString();
    const body = { subjectId, type: 'erasure', executeAfter, caseId: `conformance-${run}`, reason: 'Cookie Munch conformance check (canary subject)' };
    const opened = await call('POST', '/requests', body, { 'Idempotency-Key': key('open') });
    const id = field(opened.json, 'id');
    const st = field(opened.json, 'status');
    if ((opened.status === 200 || opened.status === 201) && field(opened.json, 'canonicalType') === 'deletion') pass('requests.alias.canonical_type');
    else fail('requests.alias.canonical_type', `type "erasure": ${said(opened)}`);

    const eta = field(opened.json, 'eta');
    if ((opened.status === 200 || opened.status === 201) && st === 'scheduled' && typeof eta === 'string' && Date.parse(eta) === Date.parse(executeAfter)) {
      pass('requests.execute_after.scheduled');
    } else if (st === 'completed' || st === 'completed_with_retention' || st === 'processing') {
      fail('requests.execute_after.scheduled', `executeAfter is ${executeAfter}, an hour away, and the executor answered "${String(st)}": it acted before executeAfter`);
    } else {
      fail('requests.execute_after.scheduled', `expected status "scheduled" with eta ${executeAfter}: ${said(opened)}`);
    }

    const replay = await call('POST', '/requests', body, { 'Idempotency-Key': key('open') });
    if (typeof id === 'string' && (replay.status === 200 || replay.status === 201) && field(replay.json, 'id') === id) pass('requests.idempotency.replay');
    else fail('requests.idempotency.replay', `a retry with the same key: ${said(replay)}${typeof id === 'string' ? ` (first answer id ${id})` : ''}`);

    const mismatch = await call('POST', '/requests', { ...body, reason: 'a different body' }, { 'Idempotency-Key': key('open') });
    if (mismatch.status === 409) pass('requests.idempotency.mismatch_409');
    else fail('requests.idempotency.mismatch_409', `the same key with a different body: ${said(mismatch)}`);

    if (typeof id !== 'string') {
      skip('requests.get', 'no request id came back');
      skip('requests.cancel.before_execute_after', 'no request id came back');
      skip('requests.cancel.keeps_data', 'no request id came back');
    } else {
      const got = await call('GET', `/requests/${encodeURIComponent(id)}`, undefined, { 'Idempotency-Key': key('get') });
      if (got.status === 200 && field(got.json, 'id') === id && field(got.json, 'status') === 'scheduled') pass('requests.get');
      else fail('requests.get', said(got));

      const cancelled = await call('POST', `/requests/${encodeURIComponent(id)}/cancel`, {}, { 'Idempotency-Key': key('cancel') });
      if (cancelled.status === 200 && field(cancelled.json, 'status') === 'cancelled') pass('requests.cancel.before_execute_after');
      else fail('requests.cancel.before_execute_after', said(cancelled));

      const after = await call('POST', '/lookup', { emails: [canaryEmail] }, { 'Idempotency-Key': key('lookup-after-cancel') });
      if (after.status === 200 && field(after.json, 'status') === 'found') pass('requests.cancel.keeps_data');
      else fail('requests.cancel.keeps_data', `a lookup after the cancel: ${said(after)} — a cancel before executeAfter must leave the data intact`);
    }
  }

  const unknown = await call('GET', `/requests/conformance-missing-${run}`, undefined, { 'Idempotency-Key': key('unknown') });
  if (unknown.status === 404) pass('requests.unknown.404');
  else fail('requests.unknown.404', said(unknown));

  if (version) pass('version.header');
  else fail('version.header', 'no answer carried an X-Version header');

  return report();

  function report(): ConformanceReport {
    const rules = CONFORMANCE_RULES.map((r) => results.get(r.id) ?? { id: r.id, title: r.title, status: 'skip' as const, detail: 'not reached' });
    const count = (s: ConformanceStatus) => rules.filter((r) => r.status === s).length;
    return { ok: count('fail') === 0, passed: count('pass'), failed: count('fail'), skipped: count('skip'), rules, ...(version ? { version } : {}) };
  }
}
