/** rightsLink (CM-14): POST /v1/sites/{cbid}/rights-links with the server's verified subject, answering the url. */
import { describe, it, expect } from 'vitest';
import { rightsLink, type RightsLinkInput } from '../src/index.js';

const answer = { url: 'https://cookiemunch.net/r/acme?t=abc', expiresAt: 1, customDomain: null };

describe('rightsLink', () => {
  it('builds a client from options and posts the subject without the cbid', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetch = (async (u: string, init?: RequestInit) => (calls.push([u, init]), new Response(JSON.stringify(answer), { status: 201, headers: { 'content-type': 'application/json' } }))) as typeof globalThis.fetch;
    const url = await rightsLink({ apiKey: 'k', baseUrl: 'https://api.example', fetch }, { cbid: 'acme', subject: { email: 'ana@example.com', userId: 'u1' }, ttlSeconds: 600 });
    expect(url).toBe(answer.url);
    expect(calls[0]![0]).toBe('https://api.example/v1/sites/acme/rights-links');
    expect(JSON.parse(String(calls[0]![1]!.body))).toEqual({ subject: { email: 'ana@example.com', userId: 'u1' }, ttlSeconds: 600 });
  });

  it('takes an existing client', async () => {
    const got: Array<[string, RightsLinkInput]> = [];
    const client = { rightsLinks: { create: async (cbid: string, input: RightsLinkInput) => (got.push([cbid, input]), answer) } };
    expect(await rightsLink(client, { cbid: 'acme', subject: { email: 'ana@example.com' } })).toBe(answer.url);
    expect(got).toEqual([['acme', { subject: { email: 'ana@example.com' } }]]);
  });
});
