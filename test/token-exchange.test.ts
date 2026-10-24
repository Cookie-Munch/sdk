import { describe, it, expect } from 'vitest';
import { exchangeOperatorToken, TokenExchangeError } from '../src/index.js';

describe('exchangeOperatorToken', () => {
  it('posts the RFC 8693 form to /v1/oauth/token and returns the key', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ access_token: 'cookiemunch_live_org_x', expires_in: 600, scope: 'sites:read dsar:read', token_type: 'Bearer' }), { status: 200 });
    }) as typeof globalThis.fetch;
    const r = await exchangeOperatorToken({ subjectToken: 'eyJ.t', scope: ['sites:read', 'dsar:read'], resource: 'site:acme', expiresIn: 600, baseUrl: 'https://api.example.com/', fetch });
    expect(r).toEqual({ accessToken: 'cookiemunch_live_org_x', expiresIn: 600, scope: ['sites:read', 'dsar:read'] });
    expect(calls[0]!.url).toBe('https://api.example.com/v1/oauth/token');
    expect((calls[0]!.init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body)))).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: 'eyJ.t',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token', scope: 'sites:read dsar:read',
      resource: 'site:acme', audience: 'cookiemunch', expires_in: '600',
    });
  });

  it('throws the RFC 6749 error', async () => {
    const fetch = (async () => new Response(JSON.stringify({ error: 'invalid_scope', error_description: 'your role (viewer) does not allow: sites:write' }), { status: 400 })) as typeof globalThis.fetch;
    const err = await exchangeOperatorToken({ subjectToken: 't', scope: ['sites:write'], resource: 'org:o', fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(TokenExchangeError);
    expect(err).toMatchObject({ error: 'invalid_scope', status: 400 });
    expect(err.message).toContain('viewer');
  });
});
