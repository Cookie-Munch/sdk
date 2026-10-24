/**
 * The cm-standard-v2 conformance kit (CMU-X20): it passes against the reference executor, and it
 * fails — naming the rule — against one that deletes before executeAfter, or matches on email
 * when an identity is given.
 */
import { describe, it, expect } from 'vitest';
import { runExecutorConformance, canaryIdentityFor, CONFORMANCE_RULES } from '../src/index.js';
import { referenceExecutor } from './fixtures/reference-executor.js';

const canaryEmail = 'canary-0123456789abcdef@canary.cookiemunch.net';
const secret = 'sk_conformance_123';
const base = { baseUrl: 'https://executor.example', secret, canaryEmail, runId: 'run1', now: () => Date.UTC(2026, 9, 23) };

const failing = (r: Awaited<ReturnType<typeof runExecutorConformance>>) => r.rules.filter((x) => x.status === 'fail').map((x) => x.id);

describe('runExecutorConformance', () => {
  it('passes every rule against the reference executor', async () => {
    const r = await runExecutorConformance({ ...base, fetch: referenceExecutor({ secret, canaryEmail, now: base.now }) });
    expect(failing(r)).toEqual([]);
    expect(r).toMatchObject({ ok: true, failed: 0, skipped: 0, passed: CONFORMANCE_RULES.length, version: '2' });
  });

  it('names requests.execute_after.scheduled for an executor that deletes before executeAfter', async () => {
    const r = await runExecutorConformance({ ...base, fetch: referenceExecutor({ secret, canaryEmail, now: base.now, violate: { deleteImmediately: true } }) });
    expect(r.ok).toBe(false);
    expect(failing(r)).toContain('requests.execute_after.scheduled');
    expect(r.rules.find((x) => x.id === 'requests.execute_after.scheduled')!.detail).toMatch(/acted before executeAfter/);
  });

  it('names lookup.identity_beats_email for an executor that matches on email when an identity is given', async () => {
    const r = await runExecutorConformance({ ...base, fetch: referenceExecutor({ secret, canaryEmail, now: base.now, violate: { emailFallback: true } }) });
    expect(failing(r)).toEqual(['lookup.identity_beats_email']);
  });

  it('names the idempotency rules for an executor that ignores Idempotency-Key', async () => {
    const r = await runExecutorConformance({ ...base, fetch: referenceExecutor({ secret, canaryEmail, now: base.now, violate: { noIdempotency: true } }) });
    expect(failing(r)).toEqual(['requests.idempotency.replay', 'requests.idempotency.mismatch_409']);
  });

  it('a wrong secret fails the lookups by name, and an unreachable executor skips everything but auth', async () => {
    const wrong = await runExecutorConformance({ ...base, secret: 'nope', fetch: referenceExecutor({ secret, canaryEmail, now: base.now }) });
    expect(failing(wrong)).toContain('lookup.email.found');
    const down = await runExecutorConformance({ ...base, fetch: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch });
    expect(failing(down)).toEqual(['auth.required']);
    expect(down.skipped).toBe(CONFORMANCE_RULES.length - 1);
  });

  it('refuses a non-https base and a non-canary address before calling anything', async () => {
    await expect(runExecutorConformance({ ...base, baseUrl: 'http://executor.example' })).rejects.toThrow(/https/);
    await expect(runExecutorConformance({ ...base, canaryEmail: 'ana@example.com' })).rejects.toThrow(/canary/);
    expect(canaryIdentityFor(canaryEmail)).toEqual({ iss: 'https://canary.cookiemunch.net', sub: 'canary_0123456789abcdef', ext: 'canary:0123456789abcdef' });
  });
});
