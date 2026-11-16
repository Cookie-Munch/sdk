/**
 * expressRights: createRightsHandlers behind an Express/Connect/Nest-shaped (req, res, next). Raw bytes
 * reach the handlers (rawBody, a Buffer body, or the unread stream); a parsed body fails loudly; paths the
 * handlers do not own, and the keyless 404, go to next().
 */
import { describe, it, expect } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { createRightsHandlers } from '../src/rights.js';
import { expressRights, RAW_BODY_REQUIRED, type ExpressLikeRequest } from '../src/rights/express.js';

const key = 'sk_exec_0123456789abcdef0123';
const idSecret = 'id-secret-0123456789abcdef0123456789';
const seen: string[] = [];
const rights = createRightsHandlers({ key, idSecret, lookup: ({ emails }) => (seen.push(...emails), emails.includes('ana@example.com') ? 'u1' : null) });
const mw = expressRights(rights);
const lookupBody = '{"emails":["ana@example.com"]}';

function fakeReq(over: Partial<ExpressLikeRequest> & { _body?: boolean }, body = ''): ExpressLikeRequest {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  return Object.assign(stream, {
    method: 'POST', originalUrl: '/privacy/lookup', protocol: 'https',
    headers: { host: 'app.example', authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-multi': ['a', 'b'] },
    ...over,
  }) as unknown as ExpressLikeRequest;
}
function fakeRes() {
  const r = { statusCode: 200, headers: {} as Record<string, unknown>, body: undefined as Uint8Array | undefined,
    setHeader(k: string, v: unknown) { r.headers[k.toLowerCase()] = v; }, end(b?: Uint8Array) { r.body = b; } };
  return r;
}
async function run(req: ExpressLikeRequest) {
  const res = fakeRes();
  let nextArg: unknown = 'not called';
  await mw(req, res, (err) => { nextArg = err; });
  return { res, nextArg, json: res.body ? JSON.parse(new TextDecoder().decode(res.body)) : undefined };
}

describe('expressRights', () => {
  it('reads the unread stream of a plain node:http request', async () => {
    const server = createServer((req: IncomingMessage, res) => void mw(req as unknown as ExpressLikeRequest, res, () => { res.statusCode = 418; res.end(); }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const ok = await fetch(`http://127.0.0.1:${port}/privacy/lookup`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: lookupBody });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('x-version')).toBe('2');
      expect(await ok.json()).toEqual({ subjectId: 'u1', status: 'found' });
      expect((await fetch(`http://127.0.0.1:${port}/elsewhere`)).status).toBe(418);
    } finally {
      server.close();
    }
  });

  it('uses req.rawBody (Nest rawBody: true) and a Buffer req.body (express.raw)', async () => {
    const a = await run(fakeReq({ rawBody: Buffer.from(lookupBody), body: { emails: ['ana@example.com'] }, _body: true }));
    expect([a.res.statusCode, a.json, a.nextArg]).toEqual([200, { subjectId: 'u1', status: 'found' }, 'not called']);
    expect(a.res.headers['cache-control']).toBe('no-store');
    const b = await run(fakeReq({ body: Buffer.from('{"emails":["bob@example.com"]}'), _body: true }));
    expect(b.json).toEqual({ subjectId: null, status: 'no_match' });
  });

  it('refuses a parsed body with no raw bytes instead of re-serialising it', async () => {
    seen.length = 0;
    const r = await run(fakeReq({ body: { emails: ['ana@example.com'] }, _body: true }));
    expect(r.nextArg).toBeInstanceOf(Error);
    expect((r.nextArg as Error).message).toBe(RAW_BODY_REQUIRED);
    expect(RAW_BODY_REQUIRED).toMatch(/express\.raw\(\{ type: 'application\/json' \}\)/);
    expect(RAW_BODY_REQUIRED).toMatch(/rawBody: true/);
    expect(seen).toEqual([]);
  });

  it('passes unowned paths and the keyless 404 to next(), and answers its own 404s', async () => {
    expect((await run(fakeReq({ originalUrl: '/api/users' }, lookupBody))).nextArg).toBeUndefined();
    const keyless = await run(fakeReq({ headers: { host: 'app.example' } }, lookupBody));
    expect([keyless.nextArg, keyless.res.body]).toEqual([undefined, undefined]);
    const forged = await run(fakeReq({ method: 'GET', originalUrl: '/privacy/requests/r1.nope.nope' }));
    expect([forged.res.statusCode, forged.json, forged.nextArg]).toEqual([404, { error: 'unknown request' }, 'not called']);
  });
});
