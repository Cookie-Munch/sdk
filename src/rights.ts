/**
 * `@cookiemunch/sdk/rights` — the cm-standard-v2 executor contract, server side.
 *
 * A product that holds personal data implements four calls and Cookie Munch drives it (docs:
 * cookiemunch.net/docs/executor-contract-v2). This builds those four calls from callbacks, so the
 * product writes only "find this person", "export them", "erase them":
 *
 *   import { createRightsHandlers } from '@cookiemunch/sdk/rights';
 *   const rights = createRightsHandlers({
 *     key: process.env.CM_EXECUTOR_KEY!,      // the secretKey you registered with Cookie Munch
 *     idSecret: process.env.CM_REQUEST_ID_SECRET!,
 *     lookup: async ({ emails, identity }) => (await findUser(emails, identity))?.id ?? null,
 *     access: async (r) => ({ status: 'completed', result: await exportUser(r.subjectId) }),
 *     erase: async (r) => { await deleteUser(r.subjectId); },
 *   });
 *   // Next.js app/privacy/[...path]/route.ts: export const { GET, POST } = rights;
 *   // Deno: Deno.serve(rights.fetch)    Workers / Bun: export default rights
 *
 * Built in: a constant-time key check (no key or a wrong key is a bare 404, so the endpoint is not
 * advertised), `X-Version` and `Cache-Control: no-store` on every authorised answer, Idempotency-Key
 * replay, HMAC-signed request ids (a forged id is a 404), `executeAfter` scheduling and cancel, and
 * the canary subject, answered here so your callbacks never see it.
 *
 * A separate entry point so the API client never loads it. Web platform only (Request, Response,
 * crypto.subtle): Node 20+, Deno, Bun and edge runtimes.
 */
import { CANARY_ISSUER } from './executor-conformance.js';

export type RightsType = 'access' | 'deletion' | 'closure' | 'restriction' | 'rectification';
export type RightsStatus = 'pending' | 'scheduled' | 'processing' | 'completed' | 'completed_with_retention' | 'no_match' | 'rejected' | 'cancelled';

export interface RightsIdentity {
  iss: string;
  sub: string;
  ext?: string;
  principal?: string;
}

export interface RightsLookupInput {
  emails: string[];
  /** A signed-in identity (sent as `identity`, or `atlas`). Match on it before the emails, and never through an email that belongs to a different identity. */
  identity?: RightsIdentity;
}

export interface RightsRetention {
  category: string;
  basis: 'legal_obligation' | 'legal_claims' | 'contract' | 'public_interest' | 'legitimate_interest';
  until?: string;
}

/** What a callback answers. Returning nothing means `completed`. */
export interface RightsOutcome {
  status: 'pending' | 'processing' | 'completed' | 'completed_with_retention' | 'no_match' | 'rejected';
  eta?: string;
  /** Plain words; required in spirit for `rejected`. */
  detail?: string;
  retention?: RightsRetention[];
  /** For `access`: `{ downloadUrl, expiresAt, sha256 }`, or the bundle inline (at most 5 MB). */
  result?: unknown;
}

/** The request a callback acts on. */
export interface RightsRequest {
  id: string;
  subjectId: string;
  type: RightsType;
  /** The word Cookie Munch sent (`erasure`, `export`, …). */
  requestedType: string;
  caseId: string;
  reason?: string;
  executeAfter?: string;
}

type Callback = (r: RightsRequest) => Promise<RightsOutcome | void> | RightsOutcome | void;

/** Where request state and idempotency answers live. A `Map` is one; so is most of a Redis client. */
export interface RightsStore {
  get(key: string): Promise<string | null | undefined> | string | null | undefined;
  set(key: string, value: string): unknown;
}

export interface RightsHandlersOptions {
  /** The key Cookie Munch sends as `Authorization: Bearer <key>`. */
  key: string;
  /** Signs request ids; at least 32 characters, the same on every instance and across restarts. */
  idSecret: string;
  /** The subject id for these emails / this identity, or null. */
  lookup: (input: RightsLookupInput) => Promise<string | null | undefined> | string | null | undefined;
  access?: Callback;
  /** `deletion` (and `closure`, when there is no `close`). Runs at `executeAfter`, not before. */
  erase?: Callback;
  close?: Callback;
  restrict?: Callback;
  rectify?: Callback;
  /** Read back a request a callback answered `pending` or `processing` for. */
  status?: Callback;
  /**
   * Default: in memory, which a restart empties. A scheduled erasure whose state is gone is never
   * run (it answers `rejected`), so give production a durable store.
   */
  store?: RightsStore;
  now?: () => number;
}

export interface RightsHandlers {
  /** The whole contract, routed on the path's tail: mount it under any prefix. */
  fetch(req: Request): Promise<Response>;
  GET(req: Request): Promise<Response>;
  POST(req: Request): Promise<Response>;
}

const CANONICAL: Record<string, RightsType> = {
  access: 'access', export: 'access', deletion: 'deletion', erase: 'deletion', erasure: 'deletion',
  closure: 'closure', restriction: 'restriction', rectification: 'rectification',
};
const OUTCOMES = new Set(['pending', 'processing', 'completed', 'completed_with_retention', 'no_match', 'rejected']);
const CANARY_EMAIL = /^canary-([0-9a-f]{16})@canary\.cookiemunch\.net$/;
const CANARY_SUBJECT = /^canary_([0-9a-f]{16})$/;
const CANARY_EXT = /^canary:([0-9a-f]{16})$/;

/** What the signed id carries: enough to answer without trusting the store for it. */
type IdClaims = { s: string; t: RightsType; y: string; c: string; a?: number; n: string };
/** The request's mutable state, in the store under `req:<id>`. */
type Stored = { status: RightsStatus; eta?: string; detail?: string; retention?: RightsRetention[]; result?: unknown; reason?: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Constant-time in the presented value: every byte of the expected key is compared. */
function sameKey(presented: string, expected: string): boolean {
  const a = enc.encode(presented);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!;
  return diff === 0;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-version': '2', 'cache-control': 'no-store' },
  });
}
const bad = (error: string, field: string) => json(400, { error, field });
// No X-Version and nothing contract-shaped: to a caller without the key this is any other 404.
const hidden = () => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function createRightsHandlers(o: RightsHandlersOptions): RightsHandlers {
  if (typeof o.key !== 'string' || !o.key) throw new Error('createRightsHandlers: key is required');
  if (typeof o.idSecret !== 'string' || o.idSecret.length < 32) throw new Error('createRightsHandlers: idSecret must be at least 32 characters');
  if (typeof o.lookup !== 'function') throw new Error('createRightsHandlers: lookup is required');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('createRightsHandlers: needs Web Crypto (globalThis.crypto.subtle)');
  // shortcut: the default store never forgets an entry; fine for the volume of rights requests, pass `store` for more.
  const store: RightsStore = o.store ?? new Map<string, string>();
  const now = o.now ?? (() => Date.now());
  const hmacKey = subtle.importKey('raw', enc.encode(o.idSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

  async function mintId(claims: IdClaims): Promise<string> {
    const payload = b64url(enc.encode(JSON.stringify(claims)));
    const sig = new Uint8Array(await subtle.sign('HMAC', await hmacKey, enc.encode(payload)));
    return `r1.${payload}.${b64url(sig)}`;
  }
  async function readId(id: string): Promise<IdClaims | null> {
    const [v, payload, sig, extra] = id.split('.');
    if (v !== 'r1' || !payload || !sig || extra !== undefined) return null;
    const sigBytes = fromB64url(sig);
    if (!sigBytes || !(await subtle.verify('HMAC', await hmacKey, sigBytes, enc.encode(payload)))) return null;
    const raw = fromB64url(payload);
    try {
      return raw ? (JSON.parse(dec.decode(raw)) as IdClaims) : null;
    } catch {
      return null;
    }
  }

  const getStored = async (id: string): Promise<Stored | null> => {
    const v = await store.get(`req:${id}`);
    return v ? (JSON.parse(v) as Stored) : null;
  };
  const putStored = async (id: string, s: Stored) => {
    await store.set(`req:${id}`, JSON.stringify(s));
  };

  const view = (id: string, c: IdClaims, s: Stored) => ({
    id,
    type: c.y,
    canonicalType: c.t,
    status: s.status,
    ...(s.eta ? { eta: s.eta } : {}),
    ...(s.detail ? { detail: s.detail } : {}),
    ...(s.retention ? { retention: s.retention } : {}),
    ...(s.result !== undefined ? { result: s.result } : {}),
  });

  const callbackFor = (t: RightsType): Callback | undefined =>
    ({ access: o.access, deletion: o.erase, closure: o.close ?? o.erase, restriction: o.restrict, rectification: o.rectify })[t];

  /** Run a callback (or, for the canary, nothing) and fold its answer into the stored state. */
  async function act(id: string, c: IdClaims, s: Stored, cb: Callback | undefined): Promise<Stored> {
    // The canary is a synthetic person: requests on it complete without touching anything real.
    const out = CANARY_SUBJECT.test(c.s) || !cb
      ? undefined
      : ((await cb({
          id,
          subjectId: c.s,
          type: c.t,
          requestedType: c.y,
          caseId: c.c,
          ...(s.reason ? { reason: s.reason } : {}),
          ...(c.a !== undefined ? { executeAfter: new Date(c.a).toISOString() } : {}),
        })) as RightsOutcome | undefined);
    const o2: RightsOutcome = out ?? { status: 'completed' };
    if (!OUTCOMES.has(o2.status)) throw new Error(`a rights callback answered an unknown status "${String(o2.status)}"`);
    const next: Stored = { status: o2.status, ...(s.reason ? { reason: s.reason } : {}) };
    if (o2.eta) next.eta = o2.eta;
    if (o2.detail) next.detail = o2.detail;
    if (o2.retention) next.retention = o2.retention;
    if (o2.result !== undefined) next.result = o2.result;
    await putStored(id, next);
    return next;
  }

  async function lookup(body: Record<string, unknown>): Promise<Response> {
    if (!Array.isArray(body.emails) || body.emails.some((e) => typeof e !== 'string')) return bad('emails must be an array of strings', 'emails');
    const emails = (body.emails as string[]).map((e) => e.trim());
    const raw = body.identity ?? body.atlas;
    if (raw !== undefined && raw !== null && !(isObject(raw) && typeof raw.iss === 'string' && typeof raw.sub === 'string')) {
      return bad('identity must be { iss, sub, ext?, principal? }', 'identity');
    }
    const identity = isObject(raw) ? (raw as unknown as RightsIdentity) : undefined;

    const canaryByEmail = emails.map((e) => CANARY_EMAIL.exec(e.toLowerCase())?.[1]).find(Boolean);
    const canaryExt = typeof identity?.ext === 'string' ? CANARY_EXT.exec(identity.ext)?.[1] : undefined;
    if (canaryByEmail || canaryExt || identity?.iss === CANARY_ISSUER) {
      // When an identity is given only it decides: the canary's email next to anyone else's identity is no one.
      const tag = identity ? (identity.iss === CANARY_ISSUER ? CANARY_SUBJECT.exec(identity.sub)?.[1] : undefined) ?? canaryExt : canaryByEmail;
      return json(200, tag ? { subjectId: `canary_${tag}`, status: 'found' } : { subjectId: null, status: 'no_match' });
    }
    const subjectId = await o.lookup({ emails, ...(identity ? { identity } : {}) });
    return json(200, typeof subjectId === 'string' && subjectId ? { subjectId, status: 'found' } : { subjectId: null, status: 'no_match' });
  }

  async function open(body: Record<string, unknown>): Promise<Response> {
    const t = typeof body.type === 'string' ? CANONICAL[body.type] : undefined;
    if (!t) return bad('type must be one of access, export, deletion, erase, erasure, closure, restriction, rectification', 'type');
    if (typeof body.subjectId !== 'string' || !body.subjectId) return bad('subjectId is required', 'subjectId');
    if (typeof body.caseId !== 'string' || !body.caseId) return bad('caseId is required', 'caseId');
    if (body.reason !== undefined && typeof body.reason !== 'string') return bad('reason must be a string', 'reason');
    const after = typeof body.executeAfter === 'string' ? Date.parse(body.executeAfter) : NaN;
    if (body.executeAfter !== undefined && body.executeAfter !== null && Number.isNaN(after)) return bad('executeAfter must be an ISO date-time', 'executeAfter');
    const cb = callbackFor(t);
    if (!cb && !CANARY_SUBJECT.test(body.subjectId)) return bad(`this system does not handle ${t}`, 'type');

    const c: IdClaims = { s: body.subjectId, t, y: body.type as string, c: body.caseId, n: b64url(globalThis.crypto.getRandomValues(new Uint8Array(9))) };
    if (!Number.isNaN(after)) c.a = after;
    const id = await mintId(c);
    const s: Stored = { status: 'pending', ...(typeof body.reason === 'string' && body.reason ? { reason: body.reason } : {}) };
    const erasing = t === 'deletion' || t === 'closure';
    if (erasing && c.a !== undefined && c.a > now()) {
      const scheduled: Stored = { ...s, status: 'scheduled', eta: new Date(c.a).toISOString() };
      await putStored(id, scheduled);
      return json(201, view(id, c, scheduled));
    }
    return json(201, view(id, c, await act(id, c, s, cb)));
  }

  async function read(id: string, c: IdClaims): Promise<Response> {
    let s = await getStored(id);
    if (!s) {
      // A genuine id whose state is gone (an emptied store): never act on it, say so.
      return json(200, view(id, c, { status: 'rejected', detail: "this system no longer holds the request's state; nothing was done. Open it again." }));
    }
    if (s.status === 'scheduled' && c.a !== undefined && now() >= c.a) s = await act(id, c, s, callbackFor(c.t));
    else if ((s.status === 'pending' || s.status === 'processing') && o.status && !CANARY_SUBJECT.test(c.s)) s = await act(id, c, s, o.status);
    return json(200, view(id, c, s));
  }

  async function cancel(id: string, c: IdClaims): Promise<Response> {
    const s = await getStored(id);
    if (!s) return json(409, { error: "this system no longer holds the request's state", field: 'id' });
    if (s.status === 'cancelled') return json(200, view(id, c, s));
    if (s.status !== 'scheduled' && s.status !== 'pending') return json(409, { error: `too late to cancel a ${s.status} request`, field: 'id' });
    const next: Stored = { status: 'cancelled', ...(s.reason ? { reason: s.reason } : {}) };
    await putStored(id, next);
    return json(200, view(id, c, next));
  }

  async function handle(req: Request): Promise<Response> {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
    if (!m || !sameKey(m[1]!.trim(), o.key)) return hidden();

    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    const route = /\/(lookup|requests)(?:\/([^/]+)(\/cancel)?)?$/.exec(path);
    const method = req.method.toUpperCase();
    if (!route) return json(404, { error: 'not_found' });
    const [, what, rawId, isCancel] = route;

    let body: Record<string, unknown> = {};
    let text = '';
    if (method === 'POST') {
      text = await req.text();
      try {
        const parsed: unknown = text ? JSON.parse(text) : {};
        if (!isObject(parsed)) return bad('body must be a JSON object', 'body');
        body = parsed;
      } catch {
        return bad('body must be JSON', 'body');
      }
    }

    // Replay: the same key and body answer what they answered first; another body is a 409.
    const idemKey = method === 'POST' && what === 'requests' ? req.headers.get('idempotency-key') : null;
    if (idemKey !== null) {
      if (idemKey.length < 16 || idemKey.length > 128) return bad('Idempotency-Key must be 16-128 characters', 'Idempotency-Key');
      const seen = await store.get(`idem:${idemKey}`);
      if (seen) {
        const first = JSON.parse(seen) as { body: string; status: number; answer: unknown };
        return first.body === text ? json(first.status, first.answer) : json(409, { error: 'Idempotency-Key reused with a different body', field: 'Idempotency-Key' });
      }
    }

    let res: Response;
    if (what === 'lookup' && !rawId && method === 'POST') res = await lookup(body);
    else if (what === 'requests' && !rawId && method === 'POST') res = await open(body);
    else if (what === 'requests' && rawId) {
      let id: string;
      try {
        id = decodeURIComponent(rawId);
      } catch {
        return json(404, { error: 'unknown request' });
      }
      const c = await readId(id);
      if (!c) return json(404, { error: 'unknown request' });
      if (isCancel && method === 'POST') res = await cancel(id, c);
      else if (!isCancel && method === 'GET') res = await read(id, c);
      else return json(404, { error: 'not_found' });
    } else return json(404, { error: 'not_found' });

    if (idemKey !== null && res.ok) await store.set(`idem:${idemKey}`, JSON.stringify({ body: text, status: res.status, answer: await res.clone().json() }));
    return res;
  }

  // A throwing callback is a 500 Cookie Munch retries; nothing is recorded for it.
  const fetch = (req: Request) =>
    handle(req).catch((err: unknown) => {
      console.error('createRightsHandlers:', err);
      return json(500, { error: 'internal_error' });
    });
  return { fetch, GET: fetch, POST: fetch };
}
