# Changelog: @cookiemunch/sdk

Every published release, newest first. Dates are the day the version was cut.

## 0.6.0 (2026-10-24)

- Added: `dsar.openCase` / `getCase` / `cancelCase` / `caseReceipt` / `caseReceiptPdf` / `listByTrace` — rights cases fanned out to every connected system, with one `executeAfter`, a trace and a signed receipt.
- Added: `dsarSettings.get` / `set` (a site's `graceDays`). **Opt-in for existing sites:** a site that existed before grace periods shipped reads `graceDays: 0` (`source: 'legacy'`) and its erasures run exactly as before until you set one; new sites start at 7.
- Added: `fulfillment.executorConformance` / `rollExecutorCompletionSecret`, `integrations.subjectCard`, and `runExecutorConformance()` — the cm-standard-v2 conformance kit as a function, no Cookie Munch key needed.
- Added: `closure` and `restriction` types, the `erasure`/`erase`/`export` aliases, and the `cancelled` status.
- Added: `fulfillment.executor(id)` — one connection with its full profile. Read it before changing `profile`: `updateExecutor` replaces the whole profile.
- Added: keys — `keys.self()`, `keys.rollSelf()`, `keys.vend({ scopes, ttlSeconds })` (short-lived, at most 12 h), `keys.listStandard()`, `keys.revokeLeaked(report)`; keys can be minted with `scopes`, `cbids` and `expiresInDays`.
- Added: `partnerLinks.list` / `create` / `revoke` (any partner, scoped), and `metadata.get` / `update` with `metadata` and `externalRef` on sites, webhooks, connections, rights requests and orgs; `?metadata[key]=` list filters; `deleteSandbox` on sandbox sites and orgs.
- Added: `sites.cookieSuggestions` / `declareCookieSuggestions`, `importCookieManifest` (any vendor's embed manifest) and `removeCookiePreset` for custom presets; `embedManifest(cbid)`; first-class cookie presets for `referalli`, `firstpromoter`, `partnerstack`, `tapfiliate` and `impact` (`referally` is a deprecated alias).
- Added: `sites.getBrand` / `setBrand` (DTCG brand.json import with a read-back), `consent.insights`, `categoryRegistry()`, `entitlements()`, `provisionEnv(ref)`, and `provision(input, { fromStep })` with the forgedeck (v2) body.
- Added: `healthWaivers.list` / `set` / `remove`, `auditSink.get` / `set` / `remove` (CloudEvents), `webhooks.replay(id, since)`, `audit(limit, { actor: 'self' })`, `fulfillment.recheckExecutor` and `executorHealthHistory`.
- Added: `readConsent(source, { requireSigned })`, `verifyDecisionSignature`, `verifyToken` (consent tokens, against the partner JWKS) and `consentSignaturePayload`.
- Added: the `X-Secret-Recipient` option seals every once-shown secret; `Idempotency-Key` on creates.

## 0.5.1 (2026-10-23)

- Fixed: `sites.waitForScan` no longer sends one extra poll in the last few milliseconds before its deadline when the server answers at once.

## 0.5.0 (2026-10-23)

- Added: `org.controller.get()` / `set()` / `remove()`: the organisation's own data-controller identity, named in rights-request notices filed without a `cbid`. Needs an unscoped key or the new `rights:write` scope.
- Added: `consentSyncSecret.get(cbid)` / `rotate(cbid)` / `remove(cbid)`: the per-site secret for hosted cross-device consent sync. `rotate` returns the secret once.
- Added: `mintConsentSyncToken({ secret, cbid, subject, ttlSeconds })`: signs the short-lived token your server hands the page for `CookieMunch.setSyncToken()`. It runs locally with no request.
- Added: `preferenceCenter.mintToken({ cbid, email | subjectId, ttlSeconds })`: mints the preference-centre token a signed-in visitor's page passes to `CookieMunch.setSubjectToken()`.

## 0.4.1 (2026-10-22)

- Added: the `referally` cookie preset (`cookieDomain`, `cookieDays`, `category` parameters on `applyCookiePreset`).
- Added: every request sends `User-Agent: cookiemunch-js/<version>`; set your own with the `userAgent` option.

## 0.4.0 (2026-10-19)

- Added: site PATCH (rename or move a site, keeping its cbid), integration health, `provision` and partner links.
- Added: the executor presets and canary health checks for connected systems; `connectExecutor` takes a `preset`.
- Added: declaration presets for the platforms a site is built on, observed-cookie removal and storage types on declarations.
- Added: opt-in strict writes and API key hygiene (`X-14`, `X-15`).

## 0.3.0 (2026-10-15)

- Added: `retireCookie` and `unretireCookie`.
- Added: `scan` can wait for the result, and `waitForScan`.

## 0.2.0 (2026-10-15)

- Added: executor webhook test and delivery log, with dry runs.
- Added: `purposes` (per-language text) and `dryRun` on declared cookies; `?lang=` on the public cookie feed.
- Added: document verification on rights-request intake answers (`trustEmailClaim`, `oidc_jwt`).
- Added: rights-page identity configuration.
- Fixed: design warnings say what happened and notices are not blamed on Accept.

## 0.1.2 (2026-10-15)

- Changed: the package builds standalone from its public repository and is published with npm provenance.

## 0.1.1 (2026-10-14)

- Added: `declareCookie`, bulk declare, `undeclareCookie` and applying a scan import.
- Added: `PUT ?keep=unspecified` and `null` in a PATCH removes the key.
- Added: `dryRunConfig`, and `lintConfig` with `designWarnings` on every config read and write.
- Added: `client.rightsPage`: draft, dry run, publish, versions, rollback (with `baseUpdatedAt` conflicts), custom domains, mail provider and account-linked rights links.
- Fixed: per-claim CNAME targets; a hostname already pointing at us is proven with the TXT token.

## 0.1.0 (2026-10-14)

- First release: a typed client for the Cookie Munch Developer API (`/v1`): sites, config, consent log and stats, DSAR, vendors and RoPA.
