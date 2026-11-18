/**
 * fastifyRights on a real Fastify: the raw bytes reach the handlers despite Fastify's JSON parser (Upcify's
 * "400 body must be JSON"), the rest of the app keeps parsing JSON, and unowned paths and the keyless 404
 * go to the app's not-found handler.
 */
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createRightsHandlers } from '../src/rights.js';
import { fastifyRights } from '../src/rights/fastify.js';

const key = 'sk_exec_0123456789abcdef0123';
const idSecret = 'id-secret-0123456789abcdef0123456789';
const rights = createRightsHandlers({ key, idSecret, lookup: ({ emails }) => (emails.includes('ana@example.com') ? 'u1' : null) });
const json = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

async function app() {
  const a = Fastify();
  a.post('/api/echo', async (req) => ({ parsed: req.body }));
  a.setNotFoundHandler((_req, reply) => reply.code(418).send('app 404'));
  await a.register(fastifyRights(rights), { prefix: '/privacy' });
  return a;
}

describe('fastifyRights', () => {
  it('serves lookup with the bytes as sent; the app outside the prefix still parses JSON', async () => {
    const a = await app();
    const ok = await a.inject({ method: 'POST', url: '/privacy/lookup', headers: json, payload: '{"emails":["ana@example.com"]}' });
    expect([ok.statusCode, ok.headers['x-version'], ok.json()]).toEqual([200, '2', { subjectId: 'u1', status: 'found' }]);
    expect(ok.headers['cache-control']).toBe('no-store');
    const echo = await a.inject({ method: 'POST', url: '/api/echo', headers: { 'content-type': 'application/json' }, payload: '{"x":1}' });
    expect(echo.json()).toEqual({ parsed: { x: 1 } });
  });

  it('sends unowned paths and the keyless 404 to the app not-found handler, and answers its own 404s', async () => {
    const a = await app();
    expect((await a.inject({ method: 'GET', url: '/privacy/other' })).statusCode).toBe(418);
    expect((await a.inject({ method: 'POST', url: '/privacy/lookup', headers: { 'content-type': 'application/json' }, payload: '{}' })).statusCode).toBe(418);
    const forged = await a.inject({ method: 'GET', url: '/privacy/requests/r1.nope.nope', headers: { authorization: `Bearer ${key}` } });
    expect([forged.statusCode, forged.json()]).toEqual([404, { error: 'unknown request' }]);
  });
});
