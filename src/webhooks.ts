/**
 * Verify an inbound Cookie Munch webhook signature.
 *
 * Cookie Munch signs every webhook delivery with the subscription's `whsec_…` secret
 * (returned once when the webhook is created). Each POST carries:
 *
 *   X-CookieMunch-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 *   X-CookieMunch-Timestamp: <unix SECONDS>
 *   X-CookieMunch-Event:     <event type, e.g. dsar.action_required>
 *
 * The signature covers the timestamp as well as the body, so a captured delivery cannot be
 * replayed forever — reject deliveries whose timestamp is outside `toleranceSeconds`
 * (default 300s / 5 min). This matches the platform-standard (Stripe-style) verifyWebhook shape.
 *
 * @example
 *   import { verifyWebhookSignature } from '@cookiemunch/sdk';
 *   // Express — capture the RAW body: app.use(express.raw({ type: 'application/json' }))
 *   app.post('/hooks/cm', (req, res) => {
 *     const ok = verifyWebhookSignature({
 *       payload: req.body.toString('utf8'),           // exact bytes, not a re-stringified object
 *       signature: req.header('X-CookieMunch-Signature'),
 *       timestamp: req.header('X-CookieMunch-Timestamp'),
 *       secret: process.env.CM_WEBHOOK_SECRET!,        // the whsec_… value
 *     });
 *     if (!ok) return res.sendStatus(400);
 *     const event = JSON.parse(req.body.toString('utf8')); // { id, type, cbid, createdAt, data }
 *     // …handle event.type…
 *     res.sendStatus(200);
 *   });
 *
 * Server-side only: uses `node:crypto`. Pass the EXACT raw request body — verifying against a
 * re-serialized JSON object fails whenever key order or whitespace differs from what was signed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyWebhookInput {
  /** The raw request body, exactly as received. Do NOT re-stringify parsed JSON. */
  payload: string;
  /** The `X-CookieMunch-Signature` header value. */
  signature: string | undefined | null;
  /** The `X-CookieMunch-Timestamp` header value (unix seconds). */
  timestamp: string | number | undefined | null;
  /** The subscription secret (`whsec_…`), shown once when the webhook was created. */
  secret: string;
  /**
   * Maximum age (in seconds) of a delivery before it is rejected as stale/replayed.
   * Defaults to 300 (5 minutes). Pass 0 to disable the freshness check entirely.
   */
  toleranceSeconds?: number;
  /** Current time in ms (injectable for tests); defaults to `Date.now()`. */
  now?: number;
}

/**
 * Returns true only when the signature is valid AND (unless disabled) the timestamp is fresh.
 * Fail-closed: any missing/malformed input returns false rather than throwing.
 */
export function verifyWebhookSignature(input: VerifyWebhookInput): boolean {
  const { payload, signature, timestamp, secret } = input;
  if (!signature || timestamp == null || timestamp === '' || !secret) return false;

  const tsRaw = String(timestamp);
  const tsNum = Number(tsRaw);
  if (!Number.isFinite(tsNum)) return false;

  const tolerance = input.toleranceSeconds ?? 300;
  if (tolerance > 0) {
    const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
    if (Math.abs(nowSec - tsNum) > tolerance) return false; // stale or replayed
  }

  // HMAC over the EXACT timestamp bytes received, joined to the raw body with a dot — matching
  // the server's `sign(secret, timestamp, body)` (packages/server/src/webhook-delivery.ts).
  const expected = `sha256=${createHmac('sha256', secret).update(`${tsRaw}.${payload}`).digest('hex')}`;

  // Constant-time compare; timingSafeEqual throws on length mismatch, so guard first.
  const got = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}
