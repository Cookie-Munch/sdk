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

`export()` returns the raw CSV string; all other methods return parsed JSON. Any
non-2xx response throws a `CookieMunchApiError { status, code?, message }`.
