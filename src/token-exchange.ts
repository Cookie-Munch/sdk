/**
 * Operator token exchange (RFC 8693, CMU-X33): swap your identity provider's token for a short-lived,
 * scoped Cookie Munch API key, so no long-lived key has to live in a file.
 *
 *   import { exchangeOperatorToken, createCookieMunch } from '@cookiemunch/sdk';
 *   const { accessToken } = await exchangeOperatorToken({
 *     subjectToken: process.env.STAFF_ACCESS_TOKEN!,   // from the sign-in your organisation trusts
 *     scope: ['sites:read', 'dsar:read'],
 *     resource: 'org:2f1c…',                            // or 'site:<cbid>' to lock the key to one site
 *   });
 *   const client = createCookieMunch({ apiKey: accessToken, baseUrl: 'https://api.cookiemunch.net' });
 *
 * No API key is needed for the exchange itself. The key it returns expires on its own (at most an hour).
 */

export interface OperatorTokenExchangeInput {
  /** The access or ID token from an OIDC issuer the deployment trusts. */
  subjectToken: string;
  /** Which kind of token `subjectToken` is. Default `access_token`. */
  subjectTokenType?: 'access_token' | 'jwt' | 'id_token';
  /** The API scopes the key should carry. Required: an exchanged key is never full access. */
  scope: string[];
  /** `org:<id>`, or `site:<cbid>` to lock the key to one site. */
  resource: `org:${string}` | `site:${string}`;
  /** Seconds, 60 to 3600. Default 3600. */
  expiresIn?: number;
  /** Default `https://api.cookiemunch.net`. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface OperatorTokenExchangeResult {
  /** A scoped Cookie Munch API key. */
  accessToken: string;
  expiresIn: number;
  scope: string[];
}

/** Thrown with the RFC 6749 `error` and `error_description` the server answered. */
export class TokenExchangeError extends Error {
  constructor(readonly error: string, readonly status: number, description?: string) {
    super(description ? `${error}: ${description}` : error);
    this.name = 'TokenExchangeError';
  }
}

export async function exchangeOperatorToken(input: OperatorTokenExchangeInput): Promise<OperatorTokenExchangeResult> {
  const base = (input.baseUrl ?? 'https://api.cookiemunch.net').replace(/\/+$/, '');
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: input.subjectToken,
    subject_token_type: `urn:ietf:params:oauth:token-type:${input.subjectTokenType ?? 'access_token'}`,
    scope: input.scope.join(' '),
    resource: input.resource,
    audience: 'cookiemunch',
    ...(input.expiresIn !== undefined ? { expires_in: String(input.expiresIn) } : {}),
  });
  const res = await (input.fetch ?? fetch)(`${base}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new TokenExchangeError(typeof body.error === 'string' ? body.error : `http_${res.status}`, res.status, typeof body.error_description === 'string' ? body.error_description : undefined);
  }
  return {
    accessToken: String(body.access_token),
    expiresIn: Number(body.expires_in),
    scope: String(body.scope ?? '').split(' ').filter(Boolean),
  };
}
