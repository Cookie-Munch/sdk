import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../src/webhooks.js';

const SECRET = 'whsec_test_deadbeef';

/** Mirror the server's signing scheme (webhook-delivery.ts sign()) exactly. */
function sign(ts: number, body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'dsar.created', cbid: null, createdAt: 1, data: { x: 1 } });
  const now = 1_700_000_000_000; // ms
  const ts = Math.floor(now / 1000);

  it('accepts a valid, fresh signature', () => {
    expect(verifyWebhookSignature({ payload: body, signature: sign(ts, body), timestamp: ts, secret: SECRET, now })).toBe(true);
  });

  it('accepts when the timestamp header is a string (as HTTP headers always are)', () => {
    expect(verifyWebhookSignature({ payload: body, signature: sign(ts, body), timestamp: String(ts), secret: SECRET, now })).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyWebhookSignature({ payload: body + ' ', signature: sign(ts, body), timestamp: ts, secret: SECRET, now })).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyWebhookSignature({ payload: body, signature: sign(ts, body, 'whsec_other'), timestamp: ts, secret: SECRET, now })).toBe(false);
  });

  it('rejects a stale timestamp beyond tolerance (replay protection)', () => {
    const oldTs = ts - 3600;
    expect(verifyWebhookSignature({ payload: body, signature: sign(oldTs, body), timestamp: oldTs, secret: SECRET, now })).toBe(false);
  });

  it('honours toleranceSeconds: 0 (freshness check disabled)', () => {
    const oldTs = ts - 99_999;
    expect(verifyWebhookSignature({ payload: body, signature: sign(oldTs, body), timestamp: oldTs, secret: SECRET, now, toleranceSeconds: 0 })).toBe(true);
  });

  it('fails closed on missing signature / timestamp / secret', () => {
    expect(verifyWebhookSignature({ payload: body, signature: undefined, timestamp: ts, secret: SECRET, now })).toBe(false);
    expect(verifyWebhookSignature({ payload: body, signature: sign(ts, body), timestamp: undefined, secret: SECRET, now })).toBe(false);
    expect(verifyWebhookSignature({ payload: body, signature: sign(ts, body), timestamp: '', secret: SECRET, now })).toBe(false);
    expect(verifyWebhookSignature({ payload: body, signature: sign(ts, body), timestamp: ts, secret: '', now })).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(verifyWebhookSignature({ payload: body, signature: sign(ts, body), timestamp: 'not-a-number', secret: SECRET, now })).toBe(false);
  });

  it('does not throw on a malformed (length-mismatched) signature', () => {
    expect(verifyWebhookSignature({ payload: body, signature: 'sha256=abc', timestamp: ts, secret: SECRET, now })).toBe(false);
  });
});
