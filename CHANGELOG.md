# Changelog: @cookiemunch/sdk

Every published release, newest first. Dates are the day the version was cut.

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
