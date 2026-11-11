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
 * the canary subject, answered here so your callbacks never see it. With `completion`, each request
 * that reaches a final status is also pushed to Cookie Munch as a signed completion, so it closes in
 * seconds instead of on the next poll.
 *
 * A separate entry point so the API client never loads it. Web platform only (Request, Response,
 * crypto.subtle): Node 20+, Deno, Bun and edge runtimes.
 */
import { CANARY_ISSUER } from './executor-conformance.js';

/**
 * The six rights, one word each. Every word Cookie Munch has sent is read as one of them: `deletion`,
 * `erase` → `erasure`; `export` → `access`. A portability request is `portability` (its callback falls
 * back to `access` when there is no `portability`).
 */
export type RightsType = 'access' | 'erasure' | 'rectification' | 'portability' | 'restriction' | 'closure';
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
  /** The word Cookie Munch sent: its `right` (one of the RightsType words) when present, else its `type`. */
  requestedType: string;
  caseId: string;
  reason?: string;
  executeAfter?: string;
}

type Callback = (r: RightsRequest) => Promise<RightsOutcome | void> | RightsOutcome | void;

/**
 * Where request state and idempotency answers live. A `Map` is one; `fileStore`, `sqlStore` and
 * `redisStore` below are durable ones. Idempotency answers are set with `ttlSeconds` (24 hours) and
 * a store may drop them after that; request state (a scheduled erasure included) is set with none and
 * must be kept. `delete`, when present, removes an answer the handlers found expired.
 */
export interface RightsStore {
  get(key: string): Promise<string | null | undefined> | string | null | undefined;
  set(key: string, value: string, opts?: { ttlSeconds?: number }): unknown;
  delete?(key: string): unknown;
}

/** How long an Idempotency-Key answer is replayed. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export interface RightsHandlersOptions {
  /** The key Cookie Munch sends as `Authorization: Bearer <key>`. */
  key: string;
  /** Signs request ids; at least 32 characters, the same on every instance and across restarts. */
  idSecret: string;
  /** The subject id for these emails / this identity, or null. */
  lookup: (input: RightsLookupInput) => Promise<string | null | undefined> | string | null | undefined;
  access?: Callback;
  /** `portability`: the person's data in a machine-readable form. Without it, `access` answers it. */
  portability?: Callback;
  /**
   * `erasure` (and `closure`, when there is no `close`). With a future `executeAfter` the request is
   * stored as `scheduled` and there is NO timer in your process: `erase` runs when Cookie Munch sends
   * `POST /requests/{id}/run` at or after `executeAfter` (its sweep runs every 10 minutes). A `GET` never
   * runs it. The state must survive a restart: give production a durable `store`.
   */
  erase?: Callback;
  close?: Callback;
  restrict?: Callback;
  rectify?: Callback;
  /** Read back a request a callback answered `pending` or `processing` for. */
  status?: Callback;
  /**
   * Default: in memory, which a restart empties. A scheduled erasure whose state is gone is never
   * run (it answers `rejected`), so give production a durable store: `fileStore(dir)`,
   * `sqlStore({ query })` or `redisStore(client)`.
   */
  store?: RightsStore;
  now?: () => number;
  /**
   * Signed completions (cm-standard-v2): the connection's `completionUrl` and its `completionSecret`
   * (`whsec_…`; read it again with `fulfillment.getExecutorCompletionSecret(id)`). Profile-based
   * systems use `webhookUrl` + `webhookSecret` instead; a `webhookSecret` also verifies here. Each request that reaches a final status is POSTed there, signed,
   * with up to 3 attempts. A failed push never fails a request: Cookie Munch's poll still closes it.
   */
  completion?: { url: string; secret: string; fetch?: typeof fetch };
}

export interface RightsHandlers {
  /** The whole contract, routed on the path's tail: mount it under any prefix. */
  fetch(req: Request): Promise<Response>;
  GET(req: Request): Promise<Response>;
  POST(req: Request): Promise<Response>;
  /**
   * Finish a request a callback answered `pending` or `processing` for, out of band (a job queue, a
   * manual review): stores the final outcome and, with `completion`, pushes it and waits for the push.
   * `delivered` is false when there is no `completion` or every attempt failed (polling still closes it).
   * A request already final is left as it is; its completion is re-sent only if it was never delivered.
   */
  complete(requestId: string, outcome?: RightsOutcome): Promise<{ status: RightsStatus; delivered: boolean }>;
}

const CANONICAL: Record<string, RightsType> = {
  access: 'access', export: 'access', portability: 'portability', erasure: 'erasure', deletion: 'erasure', erase: 'erasure',
  closure: 'closure', restriction: 'restriction', rectification: 'rectification',
};
/** The contract's `canonicalType` on the wire (executor-contract-v2), which predates the six words. */
const WIRE: Record<RightsType, string> = {
  access: 'access', portability: 'access', erasure: 'deletion', closure: 'closure', restriction: 'restriction', rectification: 'rectification',
};
const TYPE_WORDS = 'access, export, portability, erasure, deletion, erase, closure, restriction, rectification';
const OUTCOMES = new Set(['pending', 'processing', 'completed', 'completed_with_retention', 'no_match', 'rejected']);
/** The contract's final statuses: each one is pushed as a signed completion. */
const FINAL = new Set<RightsStatus>(['completed', 'completed_with_retention', 'no_match', 'rejected', 'cancelled']);
/** Wait before each completion attempt after the first. */
const COMPLETION_BACKOFF_MS = [1_000, 4_000];
const CANARY_EMAIL = /^canary-([0-9a-f]{16})@canary\.cookiemunch\.net$/;
const CANARY_SUBJECT = /^canary_([0-9a-f]{16})$/;
const CANARY_EXT = /^canary:([0-9a-f]{16})$/;

/** What the signed id carries: enough to answer without trusting the store for it. */
type IdClaims = { s: string; t: RightsType; y: string; c: string; a?: number; n: string };
/** The request's mutable state, in the store under `req:<id>`. */
type Stored = { status: RightsStatus; eta?: string; detail?: string; retention?: RightsRetention[]; result?: unknown; reason?: string; notified?: true };

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
  // shortcut: the default Map keeps an expired idempotency answer until it is read again; fine for the volume of rights requests, pass `store` for more.
  const store: RightsStore = o.store ?? new Map<string, string>();
  const now = o.now ?? (() => Date.now());
  const hmacKey = subtle.importKey('raw', enc.encode(o.idSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const completion = o.completion;
  if (completion && (typeof completion.url !== 'string' || !/^https?:\/\//.test(completion.url) || typeof completion.secret !== 'string' || !completion.secret)) {
    throw new Error('createRightsHandlers: completion needs { url, secret }: the connection\'s completionUrl and completionSecret');
  }
  // Standard Webhooks: a `whsec_` secret's HMAC key is its base64-decoded remainder; anything else signs as typed.
  const completionKey = completion
    ? subtle.importKey('raw', (completion.secret.startsWith('whsec_') && fromB64url(completion.secret.slice(6).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))) || enc.encode(completion.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    : undefined;

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
      if (!raw) return null;
      const c = JSON.parse(dec.decode(raw)) as IdClaims;
      // An id minted before the six words carries `deletion`.
      return { ...c, t: CANONICAL[c.t] ?? c.t };
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
    canonicalType: WIRE[c.t] ?? c.t,
    status: s.status,
    ...(s.eta ? { eta: s.eta } : {}),
    ...(s.detail ? { detail: s.detail } : {}),
    ...(s.retention ? { retention: s.retention } : {}),
    ...(s.result !== undefined ? { result: s.result } : {}),
  });

  /**
   * Push a final status to `completionsUrl`, signed. Never throws: a failure is logged and left to the poll.
   * Retried on a network error, a 5xx or a 429, with the same Webhook-Id, so a retry that did land is a no-op.
   */
  async function notify(id: string, c: IdClaims, s: Stored): Promise<boolean> {
    if (!completion || !completionKey || !FINAL.has(s.status) || s.notified) return false;
    try {
      const body = JSON.stringify({ caseId: c.c, request: view(id, c, s) });
      const webhookId = `cmc_${b64url(globalThis.crypto.getRandomValues(new Uint8Array(12)))}`;
      const send = completion.fetch ?? globalThis.fetch;
      for (let attempt = 0; attempt <= COMPLETION_BACKOFF_MS.length; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, COMPLETION_BACKOFF_MS[attempt - 1]));
        const stamp = String(Math.floor(now() / 1000));
        const sig = new Uint8Array(await subtle.sign('HMAC', await completionKey, enc.encode(`${webhookId}.${stamp}.${body}`)));
        let status = 0;
        try {
          status = (await send(completion.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'webhook-id': webhookId, 'webhook-timestamp': stamp, 'webhook-signature': `v1,${btoa(String.fromCharCode(...sig))}` },
            body,
          })).status;
        } catch (err) {
          console.warn('createRightsHandlers: completion push failed:', err);
        }
        if (status >= 200 && status < 300) {
          const latest = await getStored(id);
          if (latest && latest.status === s.status) await putStored(id, { ...latest, notified: true });
          return true;
        }
        if (status !== 0 && status < 500 && status !== 429) {
          console.warn(`createRightsHandlers: completion refused with ${status}; check completion.url and completion.secret`);
          return false;
        }
      }
    } catch (err) {
      console.warn('createRightsHandlers: completion push failed:', err);
    }
    return false;
  }

  const callbackFor = (t: RightsType): Callback | undefined =>
    ({ access: o.access, portability: o.portability ?? o.access, erasure: o.erase, closure: o.close ?? o.erase, restriction: o.restrict, rectification: o.rectify })[t];

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
    const next = await record(id, s, out ?? { status: 'completed' });
    void notify(id, c, next);
    return next;
  }

  /** Fold an outcome into the stored state. */
  async function record(id: string, s: Stored, o2: RightsOutcome): Promise<Stored> {
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
    // `right` names the right itself (portability, which `type` sends as access); a receiver that predates it reads `type`.
    const word = typeof body.right === 'string' && CANONICAL[body.right] ? body.right : body.type;
    const t = typeof word === 'string' ? CANONICAL[word] : undefined;
    if (!t) return bad(`type must be one of ${TYPE_WORDS}`, 'type');
    if (typeof body.subjectId !== 'string' || !body.subjectId) return bad('subjectId is required', 'subjectId');
    if (typeof body.caseId !== 'string' || !body.caseId) return bad('caseId is required', 'caseId');
    if (body.reason !== undefined && typeof body.reason !== 'string') return bad('reason must be a string', 'reason');
    const after = typeof body.executeAfter === 'string' ? Date.parse(body.executeAfter) : NaN;
    if (body.executeAfter !== undefined && body.executeAfter !== null && Number.isNaN(after)) return bad('executeAfter must be an ISO date-time', 'executeAfter');
    const cb = callbackFor(t);
    if (!cb && !CANARY_SUBJECT.test(body.subjectId)) return bad(`this system does not handle ${t}`, 'type');

    const c: IdClaims = { s: body.subjectId, t, y: word as string, c: body.caseId, n: b64url(globalThis.crypto.getRandomValues(new Uint8Array(9))) };
    if (!Number.isNaN(after)) c.a = after;
    const id = await mintId(c);
    const s: Stored = { status: 'pending', ...(typeof body.reason === 'string' && body.reason ? { reason: body.reason } : {}) };
    const erasing = t === 'erasure' || t === 'closure';
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
    // A scheduled erasure waits for POST /run: a GET is safe, it never acts.
    if ((s.status === 'pending' || s.status === 'processing') && o.status && !CANARY_SUBJECT.test(c.s)) s = await act(id, c, s, o.status);
    return json(200, view(id, c, s));
  }

  /** Run a scheduled erasure whose executeAfter has passed; anything else answers as a read. Safe to repeat. */
  async function run(id: string, c: IdClaims): Promise<Response> {
    const s = await getStored(id);
    if (s?.status === 'scheduled' && c.a !== undefined && now() >= c.a) return json(200, view(id, c, await act(id, c, s, callbackFor(c.t))));
    return read(id, c);
  }

  async function cancel(id: string, c: IdClaims): Promise<Response> {
    const s = await getStored(id);
    if (!s) return json(409, { error: "this system no longer holds the request's state", field: 'id' });
    if (s.status === 'cancelled') return json(200, view(id, c, s));
    if (s.status !== 'scheduled' && s.status !== 'pending') return json(409, { error: `too late to cancel a ${s.status} request`, field: 'id' });
    const next: Stored = { status: 'cancelled', ...(s.reason ? { reason: s.reason } : {}) };
    await putStored(id, next);
    void notify(id, c, next);
    return json(200, view(id, c, next));
  }

  async function handle(req: Request): Promise<Response> {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
    if (!m || !sameKey(m[1]!.trim(), o.key)) return hidden();

    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    const route = /\/(lookup|requests)(?:\/([^/]+)(?:\/(cancel|run))?)?$/.exec(path);
    const method = req.method.toUpperCase();
    if (!route) return json(404, { error: 'not_found' });
    const [, what, rawId, action] = route;

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
      const first = seen ? (JSON.parse(seen) as { body: string; status: number; answer: unknown; at?: number }) : null;
      // Checked here too, so a store that ignores ttlSeconds (a Map) still forgets after 24 hours.
      if (first && first.at !== undefined && now() - first.at >= IDEMPOTENCY_TTL_SECONDS * 1000) await store.delete?.(`idem:${idemKey}`);
      else if (first) {
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
      if (action === 'cancel' && method === 'POST') res = await cancel(id, c);
      else if (action === 'run' && method === 'POST') res = await run(id, c);
      else if (!action && method === 'GET') res = await read(id, c);
      else return json(404, { error: 'not_found' });
    } else return json(404, { error: 'not_found' });

    if (idemKey !== null && res.ok) {
      const answer = { body: text, status: res.status, answer: await res.clone().json(), at: now() };
      await store.set(`idem:${idemKey}`, JSON.stringify(answer), { ttlSeconds: IDEMPOTENCY_TTL_SECONDS });
    }
    return res;
  }

  // A throwing callback is a 500 Cookie Munch retries; nothing is recorded for it.
  const fetch = (req: Request) =>
    handle(req).catch((err: unknown) => {
      console.error('createRightsHandlers:', err);
      return json(500, { error: 'internal_error' });
    });
  async function complete(requestId: string, outcome?: RightsOutcome): Promise<{ status: RightsStatus; delivered: boolean }> {
    const c = await readId(requestId);
    if (!c) throw new Error('createRightsHandlers.complete: not a request id these handlers issued');
    const s = await getStored(requestId);
    if (!s) throw new Error("createRightsHandlers.complete: this system no longer holds the request's state");
    if (FINAL.has(s.status)) return { status: s.status, delivered: await notify(requestId, c, s) };
    const next = await record(requestId, s, outcome ?? { status: 'completed' });
    return { status: next.status, delivered: await notify(requestId, c, next) };
  }

  return { fetch, GET: fetch, POST: fetch, complete };
}

// ---------------------------------------------------------------------------------------------------
// Durable stores. No dependencies: each adapts something your app already has.

type DurableStore = RightsStore & { delete(key: string): Promise<void> };

/**
 * One JSON file per key in `dir` (created if missing), named by the key's SHA-256 so any key is a safe
 * filename. Writes go to a temporary file renamed into place, so a crash never leaves half a file. An
 * entry past its TTL reads as missing and is removed. Node, Deno and Bun: `node:fs` is loaded on first
 * use, so importing this entry point on an edge runtime still works.
 */
export function fileStore(dir: string): DurableStore {
  // shortcut: an expired idempotency file is removed when read, not swept; prune `dir` by mtime if it ever grows large.
  let fsp: Promise<typeof import('node:fs/promises')> | undefined;
  const fs = () => (fsp ??= import('node:fs/promises').then(async (m) => (await m.mkdir(dir, { recursive: true }), m)));
  const pathOf = async (key: string) => {
    const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(key)));
    return `${dir.replace(/[\\/]+$/, '')}/${[...hash].map((b) => b.toString(16).padStart(2, '0')).join('')}.json`;
  };
  const del = async (key: string) => {
    await (await fs()).rm(await pathOf(key), { force: true });
  };
  return {
    async get(key) {
      let raw: string;
      try {
        raw = await (await fs()).readFile(await pathOf(key), 'utf8');
      } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') return null;
        throw e;
      }
      const rec = JSON.parse(raw) as { v: string; exp?: number };
      if (rec.exp !== undefined && Date.now() >= rec.exp) {
        await del(key);
        return null;
      }
      return rec.v;
    },
    async set(key, value, opts) {
      const m = await fs();
      const file = await pathOf(key);
      const tmp = `${file}.${b64url(globalThis.crypto.getRandomValues(new Uint8Array(6)))}.tmp`;
      await m.writeFile(tmp, JSON.stringify({ v: value, ...(opts?.ttlSeconds ? { exp: Date.now() + opts.ttlSeconds * 1000 } : {}) }));
      await m.rename(tmp, file);
    },
    delete: del,
  };
}

/** The table `sqlStore` uses (Postgres). Run it once, in a migration. For SQLite: `RIGHTS_STORE_TABLE_SQLITE`. */
export const RIGHTS_STORE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS cookiemunch_rights_store (
  key text PRIMARY KEY,
  value text NOT NULL,
  expires_at timestamptz
)`;

/** The same table for SQLite (`sqlStore({ dialect: 'sqlite' })`): `expires_at` is epoch milliseconds. */
export const RIGHTS_STORE_TABLE_SQLITE = `CREATE TABLE IF NOT EXISTS cookiemunch_rights_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER
)`;

/**
 * A store over one SQL table (`RIGHTS_STORE_TABLE_SQL`, or `RIGHTS_STORE_TABLE_SQLITE` with
 * `dialect: 'sqlite'`). `query(sql, params)` runs a parameterised statement and answers `{ rows }` or the
 * rows: `pool.query` from `pg` as it is; for better-sqlite3 (and Drizzle's `db.$client`),
 * `(sql, p) => { const s = db.prepare(sql); return Promise.resolve(s.reader ? s.all(...p) : (s.run(...p), [])); }`.
 * An expired row reads as missing; expired rows are purged by the next write that carries a TTL.
 */
export function sqlStore(o: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] } | unknown[]>; dialect?: 'postgres' | 'sqlite' }): DurableStore {
  const rows = async (sql: string, params: unknown[]) => {
    const r = await o.query(sql, params);
    return (Array.isArray(r) ? r : r.rows) as Array<{ value?: string }>;
  };
  if (o.dialect === 'sqlite') {
    return {
      async get(key) {
        return (await rows('SELECT value FROM cookiemunch_rights_store WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)', [key, Date.now()]))[0]?.value ?? null;
      },
      async set(key, value, opts) {
        const exp = opts?.ttlSeconds ? Date.now() + opts.ttlSeconds * 1000 : null;
        await rows(
          'INSERT INTO cookiemunch_rights_store (key, value, expires_at) VALUES (?, ?, ?) '
            + 'ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at',
          [key, value, exp],
        );
        if (exp !== null) await rows('DELETE FROM cookiemunch_rights_store WHERE expires_at <= ?', [Date.now()]);
      },
      async delete(key) {
        await rows('DELETE FROM cookiemunch_rights_store WHERE key = ?', [key]);
      },
    };
  }
  return {
    async get(key) {
      return (await rows('SELECT value FROM cookiemunch_rights_store WHERE key = $1 AND (expires_at IS NULL OR expires_at > now())', [key]))[0]?.value ?? null;
    },
    async set(key, value, opts) {
      const ttl = opts?.ttlSeconds ?? null;
      await rows(
        'INSERT INTO cookiemunch_rights_store (key, value, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3::integer)) '
          + 'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at',
        [key, value, ttl],
      );
      if (ttl !== null) await rows('DELETE FROM cookiemunch_rights_store WHERE expires_at <= now()', []);
    },
    async delete(key) {
      await rows('DELETE FROM cookiemunch_rights_store WHERE key = $1', [key]);
    },
  };
}

/** The part of a Redis client `redisStore` uses: node-redis v4's shape, `set(key, value, { EX })`. */
export interface RightsRedisClient {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, opts?: { EX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** Keys under `cookiemunch:rights:`; idempotency answers expire through Redis's own `EX`. */
export function redisStore(client: RightsRedisClient): DurableStore {
  const k = (key: string) => `cookiemunch:rights:${key}`;
  return {
    get: (key) => client.get(k(key)),
    async set(key, value, opts) {
      await (opts?.ttlSeconds ? client.set(k(key), value, { EX: opts.ttlSeconds }) : client.set(k(key), value));
    },
    async delete(key) {
      await client.del(k(key));
    },
  };
}
