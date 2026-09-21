# @cookiemunch/sdk

A small, typed REST client for the Cookie Munch Developer API (the `/v1` surface).
Authenticate with an API key — the organization is derived server-side from the key,
so you never pass an `orgId`.

```ts
import { createCookieMunch, CookieMunchApiError } from '@cookiemunch/sdk';

const fc = createCookieMunch({
  apiKey: process.env.COOKIEMUNCH_API_KEY!, // "fck_…"
  baseUrl: 'https://cmp.example.com',         // "/v1" is appended automatically
});

const sites = await fc.sites.list();
const site = await fc.sites.create({ domain: 'example.com' }); // cbid auto-generated
const stats = await fc.consent.stats(site.cbid, { from: 0, to: Date.now() });

try {
  await fc.sites.get('does-not-exist');
} catch (e) {
  if (e instanceof CookieMunchApiError) console.error(e.status, e.message);
}
```

`fetch` is injectable via `createCookieMunch({ ..., fetch })` for tests or custom
runtimes; it defaults to the global `fetch`.

## Methods

- `me()`
- `sites.list() / create(input) / get(cbid) / delete(cbid) / getConfig(cbid) / putConfig(cbid, config)`
- `consent.stats(cbid, {from?,to?}) / log(cbid, {from?,to?,limit?}) / export(cbid, {from?,to?}) / receipt(cbid, stamp)`
- `dsar.list() / create(input) / advance(id, toStatus)`
- `vendors.list() / create(input)`
- `ropa.list() / create(input)`
- `webhooks.list() / create(input)`

`export()` returns the raw CSV string; all other methods return parsed JSON. Any
non-2xx response throws a `CookieMunchApiError { status, code?, message }`. Error `code`
values are catalogued in [`docs/api/error-codes.md`](../../docs/api/error-codes.md).

## Verifying webhooks

`verifyWebhookSignature(...)` validates an inbound webhook's `X-CookieMunch-Signature`
(HMAC-SHA256 over `` `${timestamp}.${rawBody}` ``) and its freshness. It's the authoritative
verifier — always matches the server. Fail-closed; returns a boolean.

```ts
import { verifyWebhookSignature } from '@cookiemunch/sdk';

const ok = verifyWebhookSignature({
  payload: rawBody,                          // exact request body bytes (a string)
  signature: headers['x-cookiemunch-signature'],
  timestamp: headers['x-cookiemunch-timestamp'],
  secret: process.env.CM_WEBHOOK_SECRET!,    // the whsec_… shown once on create
});
```

Full recipe (Express, edge/WebCrypto, replay protection): [`docs/api/webhook-signing.md`](../../docs/api/webhook-signing.md).
