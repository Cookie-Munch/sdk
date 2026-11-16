/**
 * `@cookiemunch/sdk/rights/express` — mount `createRightsHandlers` in Express, Connect or NestJS.
 *
 *   import express from 'express';
 *   import { createRightsHandlers } from '@cookiemunch/sdk/rights';
 *   import { expressRights } from '@cookiemunch/sdk/rights/express';
 *   const rights = createRightsHandlers({ key, idSecret, lookup, access, erase });
 *   // Before any express.json(), or with express.raw() on this route: the handlers need the bytes as sent.
 *   app.use('/privacy', express.raw({ type: 'application/json' }), expressRights(rights));
 *
 * NestJS (`NestFactory.create(AppModule, { rawBody: true })`, so `req.rawBody` holds the bytes):
 *
 *   @Controller()
 *   export class PrivacyController {
 *     private readonly rights = expressRights(createRightsHandlers({ ... }));
 *     @All('privacy/*')
 *     handle(@Req() req: Request, @Res() res: Response) {
 *       return this.rights(req, res, (err) => { if (err) throw err; res.status(404).end(); });
 *     }
 *   }
 *
 * The body passed on is the raw request bytes: `req.rawBody`, a Buffer `req.body` (express.raw), or the
 * stream read here when nothing consumed it. A `req.body` already parsed into an object is refused
 * (passed to `next(err)`), never re-serialised: signatures verify over the bytes received, and
 * `JSON.stringify` of a parsed body is not those bytes.
 *
 * A path the handlers do not own (anything not ending in `/lookup` or `/requests[/{id}[/cancel|/run]]`),
 * and the bare 404 answered to a caller without the key, go to `next()`, so the rest of the app answers
 * them as it answers any unknown path.
 */
import type { RightsHandlers } from '../rights.js';

/** The parts of an Express / Connect / Node request this reads. */
export interface ExpressLikeRequest extends AsyncIterable<Uint8Array | string> {
  method?: string;
  url?: string;
  originalUrl?: string;
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
  get?(name: string): string | undefined;
  rawBody?: Uint8Array | string;
  body?: unknown;
  readableEnded?: boolean;
  socket?: { encrypted?: boolean };
}

/** The parts of an Express / Node response this writes. */
export interface ExpressLikeResponse {
  statusCode: number;
  setHeader(name: string, value: string | string[]): unknown;
  end(body?: Uint8Array): unknown;
}

export type ExpressNext = (err?: unknown) => void;

// The same tail createRightsHandlers routes on; anything else is not ours and is never read.
const OWNED = /\/(lookup|requests)(?:\/[^/]+(?:\/(cancel|run))?)?\/*$/;

export const RAW_BODY_REQUIRED =
  '@cookiemunch/sdk/rights/express: req.body was already parsed into an object and no raw bytes are available. '
  + 'Signatures verify over the bytes received, so the parsed body cannot be re-serialised. '
  + "Keep the raw body on this route: express.raw({ type: 'application/json' }) before expressRights (and before any express.json() that covers it), "
  + 'a verify hook that sets req.rawBody, or in NestJS NestFactory.create(AppModule, { rawBody: true }).';

async function bodyOf(req: ExpressLikeRequest): Promise<Uint8Array | string | undefined> {
  if (req.rawBody !== undefined) return req.rawBody;
  if (req.body instanceof Uint8Array || typeof req.body === 'string') return req.body;
  // body-parser sets `_body` once it has consumed the stream; `{}` on a request it skipped is not a parse.
  const consumed = (req as { _body?: boolean })._body === true || req.readableEnded === true;
  if (!consumed) {
    const parts: Uint8Array[] = [];
    for await (const c of req) parts.push(typeof c === 'string' ? new TextEncoder().encode(c) : c);
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) (out.set(p, at), (at += p.length));
    return out;
  }
  if (req.body !== undefined && req.body !== null) throw new Error(RAW_BODY_REQUIRED);
  return undefined;
}

/** An Express / Connect middleware serving the handlers; resolves once the answer is written. */
export function expressRights(handlers: Pick<RightsHandlers, 'fetch'>) {
  return async (req: ExpressLikeRequest, res: ExpressLikeResponse, next: ExpressNext): Promise<void> => {
    const host = req.get?.('host') ?? (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) ?? 'localhost';
    const proto = req.protocol ?? (req.socket?.encrypted ? 'https' : 'http');
    let url: URL;
    try {
      url = new URL(req.originalUrl ?? req.url ?? '/', `${proto}://${host}`);
    } catch {
      return next();
    }
    if (!OWNED.test(url.pathname)) return next();

    let response: Response;
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          if (k.toLowerCase() === 'set-cookie') for (const one of v) headers.append(k, one);
          else headers.set(k, v.join(', '));
        } else headers.set(k, v);
      }
      const method = (req.method ?? 'GET').toUpperCase();
      const body = method === 'GET' || method === 'HEAD' ? undefined : await bodyOf(req);
      response = await handlers.fetch(new Request(url, { method, headers, ...(body !== undefined ? { body: body as BodyInit } : {}) }));
    } catch (err) {
      return next(err);
    }
    // No X-Version: the bare 404 a caller without the key gets. Let the app answer it like any other unknown path.
    if (response.status === 404 && !response.headers.has('x-version')) return next();

    res.statusCode = response.status;
    const cookies = response.headers.getSetCookie?.() ?? [];
    response.headers.forEach((v, k) => {
      if (k !== 'set-cookie') res.setHeader(k, v);
    });
    if (cookies.length) res.setHeader('set-cookie', cookies);
    res.end(new Uint8Array(await response.arrayBuffer()));
  };
}
