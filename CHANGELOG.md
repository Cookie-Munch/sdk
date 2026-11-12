# Changelog: @cookiemunch/sdk

Every published release, newest first. Dates are the day the version was cut.

## 0.27.0 (2026-11-12)

- Added: `PartnerLink.lastIgnoredAt` and `lastIgnoredReason`: the partner took the last delivery but answered `{ ignored: true }`.
- Added: the `rights:read` scope reads the organisation's rights settings (mail provider, controller, rights sign-in, captcha) without `rights:write`.

## 0.26.0 (2026-11-12)

- Added: `ScanStatus.foreignCmp` (`{ name, hosts }`): another consent platform the last crawl saw the site loading. A scan's `buttonParity` now covers only the Cookie Munch banner.

## 0.25.0 (2026-11-12)

- Added: `HealthRow.key` (`check:subject`, unique in a report), and on failing rows `reason`, `fixedBy` (`you`, `cookiemunch` or a vendor id) and `ref` (the connection or scan the row is about).
- Added: `ButtonParityScan.source` (`"visitors"`), `viewport` and `reports`, and `ScanStatus.buttonParityByViewport`: the live banner's buttons as visitors' browsers painted them.

## 0.24.0 (2026-11-12)

- Added: `Identity.attention`, the one thing to fix first (`GET /v1/me`). With no mail provider, that is `requests_filed_unverified`.
- Added: `IntegrationHealthReport.top`, the finding to fix first (also `checks[0]`).
- Added: `openapiUrl` and `statusUrl` on an executor suggestion's `waitingOn`.

## 0.23.0 (2026-11-11)

- Added: the `blocked` rights status. A callback answers `{ status: 'blocked', blocked: { reason, message } }` when the person must act first, and `status` is asked again on each read. `DsarCaseStatus` and case tasks carry `blocked`.
- Added: conformance rule `requests.access.no_secrets` (with `testSubjectEmail`): the test subject's export must hold no credential.
- Added: `orgs.createDryRun` (`POST /v1/orgs?dryRun=1`), with an optional `provision` plan.

## 0.22.0 (2026-11-11)

- Added: the rights handlers speak six rights (`access`, `erasure`, `rectification`, `portability`, `restriction`, `closure`); `deletion` and `erase` read as `erasure`, ids minted before read the same, and a `portability` callback falls back to `access`.
- Added: `POST /requests/{id}/run` on the rights handlers: a scheduled erasure runs on that POST, never inside a `GET`.
- Added: `sqlStore({ dialect: 'sqlite' })` with `RIGHTS_STORE_TABLE_SQLITE`.
- Added: `cookies` on `sites.scan` for a signed-in crawl; `scan` (schedule, afterDeploy) on site config; `undeclared` and `stale` on a finished scan.
- Added: `params` on executor connect and upgrade-preset (Referalli `programId`, cm-standard-v2 `scopeName`/`scopeId`, Lucida `projectId`/`publicKey`, Hermetica `workspaceId`/`storage`).
- Added: `since` on the audit log; `getExecutorCompletionSecret`; `rightsIdentity.check`; `executorSuggestions`; the `hermetica` mail provider.
- Added: `channel` and `integrity` on the install snippet (`embedChannel: pinned:<version>`); `clean` on integration health; `hermetica` and `subscription.changed` on partner grants.
- Changed: requests the SDK sends with no `CookieMunch-Version` stay on API version 2026-10-24 response shapes.

## 0.21.1 (2026-11-05)

- Fixed: conformance refuses a `testSubjectEmail` or `eraseSubjectEmail` that isn't an email address, and compares subjects without regard to case.

## 0.21.0 (2026-11-05)

- Added: eraseSubjectEmail on runExecutorConformance: requests.erase.removes_subject really erases that throwaway subject through the receiver's erase code, then checks a lookup no longer finds it.

## 0.20.1 (2026-11-05)

- Changed: comments name 424, not 502, for captcha_unreachable and identity_jwks_unreachable.

## 0.20.0 (2026-11-05)

- API errors carry the server's `message` when it sends one, with `code` kept.
- `testSubjectEmail` on `runExecutorConformance`, and rule `lookup.test_subject.found`. A 404 with no `X-Version` on the keyed lookup is one failure with a `fix`. Identity rows that answer 400 name the rule about `identity` and `atlas`.

## 0.19.0 (2026-11-05)

- The conformance kit stops at a refused key: `code`, `required`, `fix`, `blocked`, and rules with `status: "blocked"` and `blockedBy`.
- `requiredScopes` and `keyHint` options on `runExecutorConformance`.

## 0.18.0 (2026-11-04)

- Added: `completion: { url, secret, fetch? }` on `createRightsHandlers` (`@cookiemunch/sdk/rights`): each request that reaches a final status is POSTed to the connection's `completionsUrl` as a signed cm-standard-v2 completion (Standard Webhooks headers, 3 attempts, never fails the request, sent once).
- Added: `handlers.complete(requestId, outcome?)`: closes a `pending` or `processing` request out of band and pushes its completion; resolves to `{ status, delivered }`.

## 0.17.0 (2026-11-04)

- Added: `sites.translateConfig(cbid, { languages?, dryRun? })`: fills the missing languages of the site's own banner and category copy on its connected DeepL or Google account.
- Added: `i18n.autoTranslate` and `i18n.machineTranslations` on the site config types.

## 0.16.0 (2026-11-03)

- Added: `seolyticize` in `CookiePresetVendor`, and `none` in `StorageType` (a row that stores nothing in the browser).
- Added: `integrations.connect('forumulate', { cbid, providerKey, orgId, executor? })` types: `orgId` on the request; `key` and `request` are optional on the answer (Forumulate's has neither).
- Added: `data` on `ExecutorPresets` (the same list as `presets`).

## 0.15.1 (2026-11-03)

- Added: `incomplete` on `CookiePreset` (names the site writes that the applied preset does not declare), and `atlas.connect` on the provision request types.

## 0.15.0 (2026-11-03)

- Added: `fileStore(dir)`, `sqlStore({ query })` with `RIGHTS_STORE_TABLE_SQL`, and `redisStore(client)` in `@cookiemunch/sdk/rights`.
- Added: `RightsStore.set(key, value, { ttlSeconds })` and an optional `RightsStore.delete(key)`; backward compatible.
- Changed: Idempotency-Key answers in `createRightsHandlers` expire after 24 hours (`IDEMPOTENCY_TTL_SECONDS`), whatever the store.

## 0.14.2 (2026-11-02)

- Added: `planCookies` accepts `presets.custom` (the body of `presets.applyCustom`).

## 0.14.1 (2026-11-02)

- Added: `orgToken` on the referalli preset params.

## 0.14.0 (2026-11-02)

- Added: `sites.planCookies(cbid, { cookies, replace, presets })`: the combined dry run of a declarations write and presets, in order.
- Added: `programHandle` on the referalli preset params.

## 0.13.2 (2026-11-02)

- Added: `dsar.create(input, { dryRun: true, preview: true })` and `plan[].preview` (record types and counts per system).
- Added: `parentPrefix` on `ApiKeyPrefix` and `ApiKeyIssued` (bound child keys minted by a scoped key).
- Changed: `SiteUpdateResult` carries the site's own fields at the top, `aliases` always an array.

## 0.13.1 (2026-11-02)

- Added: `connectExecutor(…, { verify: 'defer' })` and on `upsertExecutor`; `state: 'awaiting_first_probe'` on `DsarExecutor`.

## 0.13.0 (2026-11-02)

- Added: `fulfillment.upsertExecutor(input)`: `PUT /v1/dsar/executors`, create or update the connection for a system from the create body.
- Changed: `updateExecutor` accepts the create-time fields; unchanged ones are no-ops, a changed one is `409 immutable_field` with `fields`.

## 0.12.1 (2026-11-02)

- Added: `host`, `steps` and `effect` on each `DsarCreateDryRun.plan` entry: what that system would do.

## 0.12.0 (2026-11-02)

- Added: `dsar.create(input, { dryRun: true })` answers the plan (`DsarCreateDryRun`) and files nothing; `lastSeenAt` on `Site`.
- Added: `sites.translation` / `connectTranslation` / `disconnectTranslation` / `translateCookies`: machine-translate the missing purposes of your own cookie rows on your own DeepL or Google account; `machinePurposes` on a declaration.
- Added: processor routing types: `DsarSettings.processing` and `acceptForwardsFrom` (`dsarSettings.set` takes `DsarSettingsInput`), `controller` on `DsarCreate`/`DsarCaseCreate`, `processor` and `forwardedFrom` on cases, origin `processor_forward`.

## 0.11.0 (2026-11-02)

- Added: `anchors.create` / `list` / `get`: signed, timestamped receipts for the head of your own hash-chained log (`POST /v1/anchors`).
- Added: `health.version` (the system's last `X-Version`) on executor connections; `skipped` on a created request.
- Changed: `cookies.declare` with `replace: true` leaves vendor-preset rows alone.

## 0.10.0 (2026-11-01)

- Added: `fulfillment.approveTask` / `rejectTask` for an erasure parked by `requireApproval`; `requireApproval` on connections; `verify: 1 | 'warn'` on `connectExecutor`; `listByOrigin` (`origin: "account_deletion"`).
- Added: `keepOldDomain` on `sites.update`.

- Added: `createRightsHandlers()` from `@cookiemunch/sdk/rights`: the cm-standard-v2 executor contract as Fetch API handlers built from your callbacks. It covers the key check, signed request ids, `executeAfter`, cancel, idempotency and the canary.
- Changed: the conformance kit's `auth.required` also passes a bare `404` (no `X-Version`) for a request without the credential.
- Added: `secret` on `webhooks.create` and `webhooks.rollSecret(id, { secret })`: your own signing secret, stored and not echoed back.
- Added: webhook `events` take `*` and `<family>.*`; a subscription's `matches` lists the events its patterns take today.

## 0.9.1 (2026-10-30)

- Added: cookie preset params `publishableKey` (Atlas: read the instance's own list by its public `GET /v1/cookie_manifest` when the site's Atlas key cannot), and Chatly's `storage` and `tracking` (the widget's own options, which decide whether `chatly:seen` and `chatly:utm` are declared).
- Changed: a preset result's `instance` can come from any vendor's embed manifest (`instance`), not only Atlas.

## 0.9.0 (2026-10-30)

- Added: `regulatory.upcomingForSite(cbid, { days?, minShare? })`: laws taking effect where a site's visitors are (`GET /v1/sites/{cbid}/regulatory/upcoming`).
- Changed: a preset manifest's `warnings` name the entry Cookie Munch dropped (`name`), now that one bad entry no longer invalidates the whole manifest.

## 0.8.0 (2026-10-30)

- Added: `mintFrom` and `externalId` on the DSAR executor connect method: a partner with an `executorKeyUrl` mints the executor key, so `secretKey` is optional. The dry run's `mint` shows the plan.
- Changed: a preset's `source` is typed `builtin | manifest | instance`.
- Added: `integrations.connect(provider, { cbid, providerKey, connector? }, { dryRun? })`: one-call connect for an identity provider's privacy orchestrator (`POST /v1/integrations/{provider}/connect`).
- Changed: `ProvisionRequestV2` names its block `stack` (same fields); its site tags are `stack_product`, `stack_env`, `stack_ref` and `stack_sandbox`. The trace header is `X-Trace-Id`.

## 0.7.1 (2026-10-24)

- Changed: `ConsentInsights.byLanguage` and `timeToDecision` are now filled in — opt-in by the banner's language, and a time-to-decision histogram with its median bucket — or `null` with `notRecorded` saying why.

## 0.7.0 (2026-10-24)

- Added: `sandbox.get` / `create` / `delete` — a sandbox organisation made from yours: the same people and plan, never billed, test keys only, every rights request a test.
- Added: dated API versions — the `apiVersion` client option (sends `CookieMunch-Version`), `versions()`, and `keys.updateSelf({ apiVersion })`. Keys minted from 2026-10-24 are strict about unknown body fields by default; older keys behave as before.
- Added: `exchangeOperatorToken()` — swap an identity provider's token for a key that lasts at most an hour (RFC 8693 token exchange).
- Added: `sandbox` and `sandboxOf` on `me()`.

## 0.6.0 (2026-10-24)

- Added: `dsar.openCase` / `getCase` / `cancelCase` / `caseReceipt` / `caseReceiptPdf` / `listByTrace` — rights cases fanned out to every connected system, with one `executeAfter`, a trace and a signed receipt.
- Added: `dsarSettings.get` / `set` (a site's `graceDays`). **Opt-in for existing sites:** a site that existed before grace periods shipped reads `graceDays: 0` (`source: 'legacy'`) and its erasures run exactly as before until you set one; new sites start at 7.
- Added: `fulfillment.executorConformance` / `rollExecutorCompletionSecret`, `integrations.subjectCard`, and `runExecutorConformance()` — the cm-standard-v2 conformance kit as a function, no Cookie Munch key needed.
- Added: `closure` and `restriction` types, the `erasure`/`erase`/`export` aliases, and the `cancelled` status.
- Added: `fulfillment.executor(id)` — one connection with its full profile. Read it before changing `profile`: `updateExecutor` replaces the whole profile.
- Added: keys — `keys.self()`, `keys.rollSelf()`, `keys.vend({ scopes, ttlSeconds })` (short-lived, at most 12 h), `keys.listStandard()`, `keys.revokeLeaked(report)`; keys can be minted with `scopes`, `cbids` and `expiresInDays`.
- Added: `partnerLinks.list` / `create` / `revoke` (any partner, scoped), and `metadata.get` / `update` with `metadata` and `externalRef` on sites, webhooks, connections, rights requests and orgs; `?metadata[key]=` list filters; `deleteSandbox` on sandbox sites and orgs.
- Added: `sites.cookieSuggestions` / `declareCookieSuggestions`, `importCookieManifest` (any vendor's embed manifest) and `removeCookiePreset` for custom presets; `embedManifest(cbid)`; first-class cookie presets for `referalli`, `firstpromoter`, `partnerstack`, `tapfiliate` and `impact` (`referally` is a deprecated alias).
- Added: `sites.getBrand` / `setBrand` (DTCG brand.json import with a read-back), `consent.insights`, `categoryRegistry()`, `entitlements()`, `provisionEnv(ref)`, and `provision(input, { fromStep })` with the version 2 body.
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
