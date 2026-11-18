/**
 * `@cookiemunch/sdk/rights/fastify` — mount `createRightsHandlers` in Fastify (v4 or v5).
 *
 *   import Fastify from 'fastify';
 *   import { createRightsHandlers } from '@cookiemunch/sdk/rights';
 *   import { fastifyRights } from '@cookiemunch/sdk/rights/fastify';
 *   const app = Fastify();
 *   app.register(fastifyRights(createRightsHandlers({ key, idSecret, lookup, access, erase })), { prefix: '/privacy' });
 *
 * The plugin is encapsulated (it is not wrapped in fastify-plugin, and must not be): inside it, every
 * content type is read as the raw bytes, because signatures verify over the bytes received and Fastify's
 * JSON parser would hand the handlers an object. The rest of the app keeps its own parsers.
 *
 * A path the handlers do not own (anything not ending in `/lookup` or `/requests[/{id}[/cancel|/run]]`),
 * and the bare 404 answered to a caller without the key, go to the app's not-found handler.
 */
import type { RightsHandlers } from '../rights.js';
import { OWNED, headersOf } from './shared.js';

/** The parts of a Fastify request this reads. */
export interface FastifyLikeRequest {
  method: string;
  url: string;
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/** The parts of a Fastify reply this writes. */
export interface FastifyLikeReply {
  code(status: number): FastifyLikeReply;
  header(name: string, value: string | string[]): FastifyLikeReply;
  send(body?: Uint8Array): unknown;
  callNotFound(): void;
}

/** The parts of a Fastify instance the plugin uses. */
export interface FastifyLikeInstance {
  removeAllContentTypeParsers(): void;
  addContentTypeParser(type: string, opts: { parseAs: 'buffer' }, parser: (req: unknown, body: Uint8Array, done: (err: Error | null, body?: Uint8Array) => void) => void): void;
  route(opts: { method: string[]; url: string; handler: (req: FastifyLikeRequest, reply: FastifyLikeReply) => Promise<unknown> }): unknown;
}

export const RAW_BODY_REQUIRED =
  '@cookiemunch/sdk/rights/fastify: the request body reached the handler already parsed. '
  + 'Signatures verify over the bytes received, so it cannot be re-serialised. '
  + 'Register fastifyRights(...) directly with app.register (not through fastify-plugin), so its raw-body parser applies.';

/** A Fastify plugin serving the handlers. */
export function fastifyRights(handlers: Pick<RightsHandlers, 'fetch'>) {
  return async function cookieMunchRights(app: FastifyLikeInstance): Promise<void> {
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    app.route({
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      url: '/*',
      handler: async (req, reply) => {
        const host = (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) ?? 'localhost';
        let url: URL;
        try {
          url = new URL(req.url, `${req.protocol ?? 'http'}://${host}`);
        } catch {
          return reply.callNotFound();
        }
        if (!OWNED.test(url.pathname)) return reply.callNotFound();
        const body = req.body;
        if (body !== undefined && body !== null && !(body instanceof Uint8Array) && typeof body !== 'string') throw new Error(RAW_BODY_REQUIRED);
        const method = req.method.toUpperCase();
        const response = await handlers.fetch(new Request(url, {
          method,
          headers: headersOf(req.headers),
          ...(method !== 'GET' && body != null ? { body: body as BodyInit } : {}),
        }));
        // No X-Version: the bare 404 a caller without the key gets. Let the app answer it like any other unknown path.
        if (response.status === 404 && !response.headers.has('x-version')) return reply.callNotFound();
        reply.code(response.status);
        const cookies = response.headers.getSetCookie?.() ?? [];
        response.headers.forEach((v, k) => {
          if (k !== 'set-cookie') reply.header(k, v);
        });
        if (cookies.length) reply.header('set-cookie', cookies);
        return reply.send(new Uint8Array(await response.arrayBuffer()));
      },
    });
  };
}
