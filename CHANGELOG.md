# opencred-platform Changelog

## 10.3.0 - 2026-07-dd

### Added
- Report DC API errors caught in the browser via a new
  exchange event endpoint `POST /workflows/:workflowId/exchanges/:exchangeId/events`
  beacon. The browser posts `dcapi_cancelled` / `dcapi_timeout` /
  `dcapi_error` event `type`s that map to the log events
  `presentation_dc_api_cancelled` (user dismissed the OS wallet
  picker), `presentation_dc_api_error` (a `navigator.credentials.get`
  rejection other than cancellation, carrying the DOMException `name`), and
  `presentation_dc_api_timeout` (the picker never responded within a 30s
  client-side window).
- `callback.variableAllowList` limits which exchange variables are sent in the
  callback POST body (empty or unset sends all).
- `callback.headers` sends static headers with the callback request.
- `callback.responseVariable` stores the callback response under an exchange
  variable.
- `redirectVariableAllowList` appends allowlisted exchange variables to the
  post verification redirect as query parameters.

### Changed
- The DC API flow now aborts `navigator.credentials.get` after 30 seconds
  when no wallet/credential provider responds, replacing an indefinite
  loading state with a clear "Your wallet app did not respond" message.

### Security
- The new exchange `events` endpoint requires the exchange's bearer access
  token, matching the auth tier of the exchange reset and detail endpoints; a
  request without the correct token is rejected before any event is logged.

## 10.2.0 - 2026-07-13

### Added
- Presentation log events include `browser` and `deviceType` fields classified
  from the User-Agent of the triggering request. Only coarse buckets are
  logged, never the raw User-Agent string.
- Three new presentation-funnel log events: `presentation_initiated`
  (exchange created, QR/link about to display), `presentation_request_served`
  (authorization request generated and sent to the wallet, with `profile`,
  `responseMode`, and `wire` fields), and `presentation_response_received`
  (wallet POSTed a response, before verification). Together with the existing
  events these make each funnel gap unambiguous, distinguishing user drop-off
  from wallet-side failure.
- `presentation_success` and `presentation_error` events include the resolved
  OID4VP `profile` where available, so terminal events no longer require a
  join back to `presentation_start`.

### Changed
- Wallet launch buttons no longer display a wallet icon (or the generic
  wallet glyph fallback); the label is now centered in the button.
- The DC API is treated as unavailable on Samsung Internet, whose Digital
  Credentials API implementation is not interoperable. Interaction falls back
  to the configured OID4VP default presented over QR/link.
- Callback failures are logged with their cause: OAuth token refresh failures
  are distinguished from callback POST failures, and POST failures report an
  HTTP status vs. a network-level error.

### Fixed
- Restore `opencred.authorization` after config schema validation. Since
  v10.0.0, validation replaced `config.opencred` with a new object, orphaning
  the computed `authorization` entries derived from workflow `callback.oauth`
  blocks. Every OAuth-authenticated callback then failed with a `TypeError`
  before requesting a token, logging `Callback failed to send.` The derived
  entries are now attached explicitly during `bedrock.init`, and a missing
  issuer entry now produces a clear error instead of a `TypeError`.
- Add left padding to the "Current" badge in the interaction picker so it is no
  longer flush against the method label next to it.
- Hide the wallet deep-link launch button on the QR-and-link fallback screen
  for desktop browsers, where the wallet app link cannot be handled; desktop
  users now only see the QR code. A new
  `opencred.options.oid4vpDisplayLinkOnDesktop` option (default `false`)
  restores the button as a debugging affordance for copying the
  `openid4vp://` request URL.
- Show a specific "Timer expired." message when the exchange TTL elapses,
  instead of the generic exchange-failure title and "The following error was
  encountered:" subtitle. New translation keys `exchangeErrorTtlExpiredTitle`
  and `exchangeErrorTtlExpiredSubtitle` are overridable per workflow.

## 10.1.3 - 2026-07-03

### Fixed
- Fix `generate:config` emitting the removed `cadmv-wallet` option, which caused
  the generated config to fail schema validation on startup. Emit the current
  `cadmv-android` and `cadmv-ios` wallet options instead.

## 10.1.2 - 2026-06-22

### Changed
- Update label for `apple-wallet` and `cadmv-android`.

## 10.1.1 - 2026-06-17

### Fixed
- Upgrade `credential-handler-polyfill` to `4.0.3` to fix browser restriction in
  iOS Chrome.

## 10.1.0 - 2026-06-09

### Added
- Workflows may configure multiple OIDC `redirectUri` values (string or array).
  requested `redirect_uri` is bound to the exchange.
- Exchange responses include `expires` (ISO 8601 `dateTimeStamp` with `Z`
  suffix) indicating when the exchange expires. `createdAt` is no longer
  mutated on refresh/reset.
- `exchangeTtlDisplayThresholdSeconds` option (default `60`) controls when
  the on-screen countdown becomes visible.
- `ttl` field is deprecated in API responses; prefer VCALM prop `expires`.

### Changed
- Native workflow: the exchange `expires`/TTL is reset by the reset
  endpoint (without mutating `createdAt`). Ordinary activity no longer
  extends an exchange's expiry.
- Exchange status polling no longer pauses after ~100 seconds of
  inactivity; polling continues until the exchange completes, becomes
  invalid, or expires.

### Security
- Updated dependencies to address OSV/npm audit findings: `fast-uri`,
  `qs`, `@babel/plugin-transform-modules-systemjs`, `diff`,
  `serialize-javascript`, `unhead`/`@unhead/vue`, and `uuid` (via
  `@digitalbazaar/ezcap` and `@azure/msal-node` upgrades).

## 10.0.9 - 2026-05-28

### Fixed
- ReaderAuth wire shape updated for Apple Wallet support.
- Ensure `google-wallet` profile is launched at a higher priority than
  `18013-7-Annex-D` for Google Wallet invocations.

### Added
- Config may set a human-oriented generic error message for DC API workflows
  with `defaultDcApiErrorMessage`. When empty, the technical error message is
  shown.
- New optional workflow query item `fieldsToRetain` list of fields to mark
  `intent_to_retain: true` in mDoc DC API device requests.
- Startup sanity check for `walletCertificates` entries: ensures SANs match.
- `scripts/analyze-presentation-events.js` CLI entry point that reads CSV log
  exports, parses `@message` JSON, and writes analysis output. Drop a log CSV
  with a "@message" column and run with `node
  scripts/analyze-presentation-events.js <csv>...` to get a summary of events,
  exchanges, and success rates by clientId/profile.
- `npm run oidc-rp -- --workflow <workflow>` to start an OIDC RP server that can
  be used to test OpenCred's login flow. Launches basic express server that lets
  you click a button to direct into opencred OIDC workflow and then back to RP
  to analyze id_token data.
- `scripts/audit-dc-api-request.js` (`npm run audit-dc-api`) — CLI that decodes
  a base64url `deviceRequest` (and optional `encryptionInfo`), inspects the leaf
  reader certificate, and diffs two requests field-by-field with `--compare`.
  JSON output by default; `--pretty` for human-readable text.

### Changed
- Prioritize `apple-wallet` profile over Annex C for Apple Wallet launch
  button.

## 10.0.8 - 2026-05-20

### Changed
- Refactored DCQL query generation for testability.
- Improve DCQL query matching performance with shortcuts
  for built-in VC base type, while allowing custom `dcql_query`.

### Added
- Expanded debug modal with tabbed Info and Translations views.
- Compact Info tab with summarized workflow/picker state and raw exchange JSON.
- Memory-only translation override editor with YAML copy workflow.
- Log `context_fetch` event when the document loader fetches a JSON-LD context
  from the network.
- Schema validation requires `context` when `type` is present in workflow query
  items.
- Statically load the Open Badges v3.0.3 context
  (`https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json`) via
  `@digitalcredentials/open-badges-context`
- `interactEnabled` configuration option (global
  `options.interactEnabled` and per-workflow `workflow.interactEnabled`)
  controls whether the Interaction URL (qr-and-copy) profile is a
  default picker option. When `false`, the profile moves to the
  advanced settings as a user opt-in. Default: `true` (enabled).
  Inheritable via `configFrom`.
- Add `node scripts/verify-workflow-credentials.js configs/combined.yaml` to
  smoke test workflow creation against a running environment.

## Fixed
- `dcApiEnabled` config value is now included on the workflow
  object sent to the frontend, ensuring picker respects config

## 10.0.7 - 2026-05-12

### Changed
- Optional `workflowId` property on workflow configuration for backward
  compatibility with clients migrating from earlier OpenCred versions.
  Clients can use either `clientId` or `workflowId` in URL paths and
  authentication.
- Startup validation for duplicate `clientId` and `workflowId` values.
  Uniqueness enforcement.
- Made test filenames more consistent.
- Improved translation merging with `configFrom` inheritance to enable
  more selective merging and multi-level overrides.

### Fixed
- Fixed issue with Google Translate anchor href="#" triggering Vue Router navigation,
  which would redirect to "/" and break the exchange flow.

## 10.0.6 - 2026-05-11

### Changed
- Documented TEST/UAT 2026 issuer DID in README
- Refactored web UI to use Vue composables instead of provide/inject for
  exchange context distribution; eliminates duplicate context fetching in
  LoginView and HomeView.
- Redesigned wallet app download section to show only workflow-relevant wallets
  with wallet identity (icon + name) alongside store badges; added
  platform-aware filtering and collapsible display for 3+ wallets.
- Added app store links (storefronts) for Google Wallet, Apple Wallet, and
  Learner Credential Wallet.
- Added debug display panel toggled via Shift+Ctrl+X when debug mode is enabled.
- Added "Powered by OpenCred" text on exchange card.
- Added `@vueuse/core` dependency for keyboard shortcuts and toggle utilities.
- OpenID for Verifiable Presentations DC API protocol identifier upgraded to
  OID4VP 1.0: ISO 18013-7 Annex D and OID4VP HAIP 1.0 flows now emit
  `openid4vp-v1-unsigned` / `openid4vp-v1-signed` per OID4VP 1.0 §A.1,
  replacing the pre-1.0 `openid4vp` identifier.
- Annex D, Annex C, and HAIP `client_metadata` updated to OID4VP 1.0 shape:
  `vp_formats_supported.mso_mdoc.{issuerauth_alg_values, deviceauth_alg_values}`
  with COSE algorithm integers (`-7` for ES256), replacing the legacy
  `vp_formats.mso_mdoc.alg = ['ES256']` shape.
- HAIP `client_metadata` always populates `jwks.keys` for response encryption
  (independent of `x5c` presence) and advertises
  `encrypted_response_enc_values_supported`.
- Web client (`web/utils/dcapi.js`) is now profile-agnostic; the
  authorization-request endpoint returns a ready-to-use
  `{ dcApiRequest: { protocol, data } }` envelope and the wallet response is
  forwarded back unaltered, removing all client-side JWT decoding and
  per-profile branching.
- Annex D unsigned envelopes now strip the OID4VP 1.0 §A.3 forbidden fields
  (`client_id`, `client_id_scheme`, `expected_origins`).
- SpruceID DC API handler isolates the `@spruceid/opencred-dc-api` WASM
  library at the legacy `openid4vp` identifier and translates to/from the v1
  wire identifier at the OpenCred boundary.
- Annex C `DeviceRequest` updated with `profile=apple-wallet` and
  `profile=18013-7-Annex-C` (tag-24 `itemsRequest`; bool-map `nameSpaces`;
  `deviceRequestInfo` with `documentSets=[[0],[1],…]` per-alternative
  semantics). Existing unsigned `profile=18013-7-Annex-C` callers see no change
  in signing requirements but receive the corrected `DeviceRequest` shape.
- Fix Annex C `deviceRequestInfo` now nesting, placing `documentSets` inside a
  mandatory `UseCase` (`useCases: [{mandatory: true, documentSets:
  [[0], [1], …]}]`)
- Annex C response handler now accepts either `Response` (uppercase, per ISO
  18013-7 spec) or `response` (lowercase, as seen in CA DMV wallet and spruceid
  handler).
- Upgraded `@spruceid/opencred-dc-api` to `0.3.0-rc.1`. The spruceid handler
  now passes mDL issuer trust anchors (from `caStore`, treated as
  `TrustPurpose::Iaca` alt anchors) and the reader cert chain (from the
  `authorization_request` signing key, full leaf+intermediate chain) as
  separate `issuerCaX5cPem` / `readerCaX5cPem` config fields on
  `DcApi.new`, replacing the legacy single combined-chain argument. The
  WASM API also moved its top-level constructor to a config-object shape
  and renamed `create_new_session`/`initiate_request`/`submit_response` to
  `createNewSession`/`initiateRequest`/`submitResponse`; the handler is
  updated accordingly.
- `configs/configUtils.js` → `configs/config-utils.js` (kebab-case consistency).

### Added
- Backward-compat acceptance of the legacy `openid4vp` identifier on responses
  via a shared `unwrapDcApiOid4vpResponse` helper, with a
  `legacy_protocol_identifier` telemetry event for observability.
- New shared modules under `lib/workflows/common/` for DC API envelope
  construction (`dc-api-envelope.js`), `client_metadata` assembly
  (`client-metadata.js`), `vp_formats_supported` builders
  (`oid4vp-formats.js`), session-transcript building
  (`session-transcript.js`), JAR signing (`jar-signing.js`), and profile
  identification (`identify-profile.js`).
- Annex D `?signed=true` query parameter to opt into the OID4VP 1.0 signed
  request envelope (default unsigned); HAIP remains signed-only.
- Unit test coverage under `test/unit/workflows/` for the new shared modules
  (DC API envelope, JAR signing, formats, client metadata, session transcript,
  and profile identification).
- `opencred.walletCertificates[]` config for per-wallet reader-authentication
  bundles (Apple Wallet and Google Wallet).
- `profile=apple-wallet` OID4VP profile: signed ISO/IEC 18013-7 Annex C
  `DeviceRequest` with `readerAuthAll`.
- `lib/workflows/common/mdoc-device-request.js` spec-conformant DeviceRequest
  builder.
- `lib/workflows/common/mdoc-reader-auth.js` COSE_Sign1 ReaderAuth signer
  (ES256, x5chain / RFC 9360).
- `lib/workflows/common/wallet-certificates.js` config loader.
- `apple-wallet` entry in native `getProtocols()` when configured.
- Google Wallet profile (`profile=google-wallet`) for OID4VP 1.0
  signed requests with `x509_hash` client_id scheme and encrypted
  responses (`dc_api.jwt`). Requires a `walletCertificates` entry
  with `wallet: google-wallet`.
- `computeX509HashClientId` helper for x509_hash client_id
  computation from DER certificates.
- vp_token array normalization in Annex D and HAIP response handlers
  (OID4VP 1.0 compliance).
- Annex C `serializedOrigin` is now the HTML-spec serialized origin
  (`scheme://host[:port]`), default ports stripped in case of misconfiguration.

### Removed
- Delete orphaned `lib/workflows/native-18013-7.js` (the pre-split monolithic
  18013-7 handler). All helpers had been duplicated to
  `lib/workflows/common/oid4vp-shared.js` and `session-transcript.js`, and
  the two entry points had been superseded by per-profile handlers under
  `lib/workflows/profiles/native-18013-7-annex-{b,c,d}.js`.

## 10.0.5 - 2026-04-16

### Changed
- Updates to UI to make better use of `@digitalbazaar/cadmv-ui` package.
- Split out common frontend functionality into reusable composables.
- Add workflow specific translation override capability.
- Add lockfile, update dockerfile to use it during install.
- Update dependencies.
  - `@bedrock/core@6.3.0`.
  - `@bedrock/express@8.6.2`.
- Update dev dependencies.
- Remove unused dependencies.
  - `@digitalbazaar/oid4-client`
- Add missing direct dependencies.
  - `@digitalbazaar/ecdsa-multikey`
  - `base64url-universal`
  - `did-jwt`
  - `jsonld`
- Changed README and example config to clarify prod CA DMV issuer DID.

## 10.0.4 - 2026-04-03

### Fixed
- Fix config and frontend mismatch around redirectUri context item. OIDC login
  success shows an i18n manual-continue line after a short delay.

## 10.0.3 - 2026-03-18

### Fixed
- Fixes default OID4VP protocol expression to `opencred.options.OID4VPdefault`.

## 10.0.2 - 2026-03-11

### Fixed
- Fix OID4VP authorization request JWT typ header: use `oauth-authz-req+jwt` per
  OID4VP 1.0 (section 5.2) and JAR/RFC9101 for all OID4VP profiles.
- Support vp_token nested in data for wallet forward compatibility
- Fix OID4VP 1.0 spec compliance for client_id: OID4VP-1.0 and OID4VP-combined
  now use the `decentralized_identifier:` prefix in client_id and omit
  client_id_scheme per OID4VP 1.0 (Annex C, Annex D). OID4VP-draft18 unchanged.
- Fix default brand color/logo population from defaultBrand when partial brand
  is provided in a workflow.
- Fix CSS variable population for brand colors to skip non-supported properties.
- Fix npm audit-flagged `jsonpath` with `jsonpath-plus`.
- Fix incorrect error serialization for some nested LDP verification errors.
- Fix support for authorization request POST with `wallet_nonce`, advertised via
  `request_uri_method: "post"` in OID4VP protocol URLs, except the
  OID4VP-draft18 profile that does not support it.
- Fix missing interaction URL protocol for jwt_vc_json and mso_mdoc workflows if
  user enables it in advanced settings.
- Fix presentation success conflation with callback success log messages.

## 10.0.1 - 2026-03-06

### Added
- Add content negotiation to interaction URL: redirect browser requests
  (Accept: text/html) to verification UI with exchange_token; return JSON
  protocols for wallets/APIs (Accept: application/json or no Accept header).
- Add exchange_result JWT as Bearer token auth for getExchangeStatus and
  continuation context, with `exchange:partial` scope that scrubs credential
  data from responses.
- Allow encoded JSON string for mainDocument and linkageDocument.
- Enable GitHub Actions to run conditionally based on environment variables for
  better working with forks.
- Add configuration script to generate a complete configuration with signing keys,
  a self-signed certificate (with SAN DNS for your domain), and starter workflows.
- Add workflow option picker. When initially selected workflow is unavailable,
  enable connection of different wallets over several supported protocols to
  complete an exchange.
- Add advanced settings menu for selecting additional protocols to try (e.g.,
  OID4VP-1.0 with dcql_query for Spruce pre-release wallet testing).
- Add additional options for `qr` parameter on exchange creation to generate QR
  for specific protocols other than the default OID4VP protocol, which is
  included either with `?qr=true` or when `includeQRByDefault` is true.

### Changed
- Use `protocols.interact` from `GET /interactions/:exchangeId` (or the
  protocols endpoint) for QR codes and links. When opened in a browser, the
  interaction URL redirects to the verification UI with continuation context.
  The draft `continuationUrl` variable is no longer used.

### Fixed
- Fix issue with didWeb document signing key ID, allow customization or use
  automatically calculated thumbprint.
- Improve automatic protocol selection and descriptive text.

## 10.0.0 - 2026-02-27

### Added
- Add optional public workflow listing feature with "enable".
- Add support for `mso_mdoc` format credentials such as mDL Driver's Licenses
- Add support for experimental W3C Digital Credentials API
- Add support for `x509_san_dns` client_id_scheme in OID4VP exchanges.
- Add wallet selection feature in UI for QR code or same device link interactions.
- Add multiple OID4VP protocol versions to support different wallets and enable
  developer testing.
- Improve VCALM / VC-API exchanges support for additional wallets.
- Add `@spruceid/opencred-dc-api` to support DC API interaction method
  exchanges requesting mDoc credentials only. Co-authored by
  [Ryanmtate](https://github.com/Ryanmtate).
- Add new simplified "query" format for workflows enabling simpler query
  construction for requested credential types.
- Add workflow "presets" for common use cases, starting with ISO 18013
  Driver's License Verifiable Credentials.
- Add new category of "unit" tests run through mocha with `npm run test:unit`
  for faster testing of targeted sections of code.
- Add mDoc claims to id_token for OIDC flows.
- Add authorization response redirect_uri flow: wallet receives
  `redirect_uri` with `exchange_token` JWT; frontend detects token, fetches
  `/context/continue`, and for login shows "Continue to [client]" when
  `autoRedirectToClient` is false.
- Add theme defaults and favicon support.
- Add test command to package.json and CI.
- Add GitHub Actions test workflow.
- Add `continuationUrl` to native workflow create exchange response for HTTP
  API clients to redirect users to OpenCred's verification UI in a new window.

### Changed
- **BREAKING**: Simplified config schema with workflows and presets. Removed
  separate `workflow.id` separate from `clientId`.
- **BREAKING**: Removed `scopes` from OIDC section of config schema.
- Terminology: Changed "relying party" to "workflow" across the application code
  and configuration.
- Improve UI by implementing several `@digitalbazaar/cadmv-ui` Vue components.
- Enable did web document by default, as this is required for most OID4VP
  workflows.
- Set default OID4VP protocol to OID4VP-combined.
- Improve DID Auth support in authorization requests.
- Improve icon consistency with `@digitalbazaar/cadmv-ui` components.
- Use Quasar copyToClipboard for same-device links.
- Fix inconsistent node version and date references across config.
- Update minor dependencies.
- Update copyright date to 2026.

### Fixed
- Add index for exchange query by accessToken (performance).

## 9.0.7 - 2026-01-23

### Added
- Use "VC Disabled Parking Placard" JSON-LD contexts from:
  - `@digitalbazaar/vc-dpp-context@1`
- Use "Verifiable Vehicle Credentials" JSON-LD contexts from:
  - `@digitalbazaar/vvc-context@1`

## 9.0.6 - 2025-10-21

### Changed
- Refactored the document loader to use the `@digitalbazaar/http-client` dependency.

### Fixed
- Sanitize OIDC input codes.

## 9.0.5 - 2025-08-20

### Fixed
- Fixed additional crash caused by incorrect log call before config is loaded.

## 9.0.4 - 2025-08-20

### Fixed
- Fixed crash caused by incorrect logger invocation.
- Added safety checks for some possible cases where exchange would be complete
  but no verifiablePresentation was provided.

## 9.0.3 - 2025-06-13

### Changed
- Updated error reporting for more clarity on combinations of verification
  errors.

## 9.0.2 - 2025-06-12

### Fixed
- Fixed incorrect status check logic to ensure that revoked credentials are flagged.
- Additional credential correctness and fitness for purpose checks.

## 9.0.1 - 2025-06-10

### Fixed
- Improved error message reporting for failed verifications due to status
  credential verification errors.
- Catch rare error caused by some inaccurate workflow configurations.

## 9.0.0 - 2025-04-30

### Added
- Added status checking that supports Bitstring Status List v1.0. Credentials
  with unsupported status type will be rejected.

### Changed
- Updated dependency `@bedrock/mongodb@11` to support MongoDB 8.x. Recommended
  to upgrade database after or concurrently with deploying this version of
  OpenCred.

### Fixed
- Fixed error redirecting to client `redirect_uri` after exchange is complete.

## 8.7.2 - 2025-04-22

### Fixed
- Fixed format identifiers for VCs and VPs in the authorization request.

### Changed
- Updated dependency `@digitalbazaar/oid4-client@4.3.0`.
- Improve constraintsOverride processing. It is now not likely to be necessary
  to use `constraintsOverride` in the config.

## 8.7.1 - 2025-04-18

### Fixed
- Fix issue with `did:jwk` resolution, `did-jwk` requires legacy
  `JsonWebKey2020` type.

## 8.7.0 - 2025-04-15

### Added
- New configurable timeout for exchanges `options.recordExpiresDurationMs` and
  `options.exchangeTtlSeconds`.
- Added support for `ecdsa-rdfc-2019` Data Integrity cryptosuite, replacing
  deprecated `ecdsa-2019`.
- Customizable image height/width for header primary & secondary logos.

### Changed
- Deprecated `exchangeActiveExpirySeconds` config parameter.
- Improved handling for `EnvelopedVerifiableCredentials` and clarified function
  names.
- Improved same-device handoff with not-installed detection and warning.
- Updated dependencies:
  - `@bedrock/config-yaml@4.3.3` (do not log config on read failure)
  - Update `did-jwt-vc` dependency to latest major version.
  - Updated dependency `@digitalbazaar/vc` to support 2.0 VCDM credentials
  - `@digitalbazaar/data-integrity`
  - `@digitalbazaar/http-client` and `jsonld-document-loader`
  - `@digitalbazaar/did-method-web`
  - `@digitalbazaar/did-method-jwk` for authentication proofPurpose
  - Context files: `@digitalbazaar/credentials-context`, `@digitalbazaar/data-integrity-context`

## 8.6.1 - 2025-01-28

### Fixed
- Fix leak of recaptcha secret in web config.

## 8.6.0 - 2024-09-23

### Added
- Add `caStore` to relying party config.

### Changed
- Make x5c check conditional for Entra exchange.
- Add config-based override for x5c enforcement to native exchange.

## 8.5.0 - 2024-09-19

### Added
- Log Entra callback explicitly.

## 8.4.3 - 2024-09-18

### Fixed
- Remove success log event for Entra callback error.
- Remove extra error log event for Entra callback error.

## 8.4.2 - 2024-09-13

### Fixed
- Redact callback error log.

## 8.4.1 - 2024-09-12

### Fixed
- Report error upon encountering a callback error.

## 8.4.0 - 2024-09-11

### Added
- Add logging for successful and failed presentation attempts.
- Add Entra verification callback logs.

## 8.3.0 - 2024-08-14

### Added
- Add additional validation for trusted issuers.
- Add X.509 validation to Entra workflows, in case Entra doesn't do it natively.
- Make exchange error title and subtitle messages configurable.
- Make reset title message configurable.
- Make exchange active expiry time configurable.
- Render exchange active expiry time in UI.

### Changed
- Replace `decodeJwtPayload` with `jose.decodeJwt`.

## 8.2.1 - 2024-07-25

### Fixed
- Fix breaking change in `BaseWorkflowService.getExchange`.

## 8.2.0 - 2024-07-17

### Added
- Add support for config validation and VS Code schema-based config completion.
- Add default values for audit fields.

### Fixed
- Avoid reCaptcha timeout by waiting to invoke it until the user submits.
- Enable user to reset exchange from failed back to pending to try submitting
  again.
- Fix Entra security bug, by using a different secret access token for an
  exchange's verification callback endpoint.

### Changed
- Changed cookie timeout from 15m to 1m
- Exchange is updated to invalid state upon invalid JWT presentation.
  (resettable)
- Removed development-only optional `credentialVerificationCallbackAuthEnabled`
  Entra workflow configuration option.

## 8.1.1 - 2024-07-08

### Changed
- Updated `credential-handler-polyfill` to released version.

### Fixed
- End the spinner if the exchange fails (enters an invalid state), and show an
  error message.

## 8.1.0 - 2024-07-02

### Added
- Add better reCAPTCHA logging to audit feature.

### Fixed
- Add missing return statement to /context/verification endpoint.

## 8.0.0 - 2024-07-02

### Added
- Add tutorial documents.
- Add logo to README.
- Add reCAPTCHA to the audit form.

### Changed
- Use red asterisks to denote required fields in the audit form.
- Changed example config to show "steps" in Entra config.
- Compress audit config fields into single object.
- Enabled more precise control of text when switching OID4VP views.

### Fixed
- Updated `credential-handler-polyfill` to experimental branch to incorporate
  module change.
- Remove all whitespace from VP token before submitting audit.

## 7.2.5 - 2024-05-24

### Fixed
- Fixed another bug with old spinner showing in mobile view.

## 7.2.4 - 2024-05-23

### Fixed
- Fixed old spinner showing in mobile view.

## 7.2.3 - 2024-05-23

### Changed
- Improve error handling in config validation.

### Fixed
- Fix missing "step" functionality in Entra flow.

## 7.2.2 - 2024-05-23

### Fixed
- Fix ability to create a new authorization request when in mobile active state.

## 7.2.1 - 2024-05-15

### Fixed
- Fix `client_id` requirement on `/config/app.json`.

## 7.2.0 - 2024-05-15

### Added
- Add RP specific translations override.

## 7.1.1 - 2024-05-14

### Fixed
- Apply fixes to the `authorization.js` config.

## 7.1.0 - 2024-05-14

### Added
- Add support for dropdown audit fields.
- Add new verification page.
- Add `untrustedVariableAllowList` to a workflow to allow specific custom
  variables to be provided via untrusted user input.
- Add callbacks to workflow steps.
- Add new `active` state once authorization request has been retrieved.
- Add button view in mobile view with QR code option.

## 7.0.0 - 2024-04-30

### Changed
- **BREAKING**: Remove `qrClickMessage`.

## 6.6.0 - 2024-04-24

### Added
- Add custom google translate translations.

### Fixed
- Use `oidc.state` from previous exchange on creating new one.
- Remove OIDC requirements in config.

## 6.5.0 - 2024-04-19

### Added
- Add Translations using `vue-i18n` and config values.
- Add audit feature for VP tokens presented in the past.

### Changed
- `redirectUrl` can be included as a variable in exchange.
- Bearer `accessToken` can create exchanges.
- Create new exchange for same device flow.
- Save cookies to redirect users to proper exchange after presentation.

## 6.4.0 - 2024-04-04

### Added
- Entra can be used as an exchange backend.

### Fixed
- Display OAuth validation errors in UI as appropriate.

### Changed
- Resized video and added close button.

## 6.3.0 - 2024-03-21

### Added
- Add explainer video.

## 6.2.0 - 2024-03-20

### Added
- Add separate link for home.

### Changed
- Rename logos and links.

## 6.1.0 - 2024-03-20

### Changed
- Update Bedrock Quasar dependencies.
  - `@bedrock/quasar@10`.
- Unpin `quasar`.
- Use quasar `platform.is.mobile` instead of userAgent regex.
- Update lint tooling and fix lint issues.
- Handle both expected x5c claim formats.
- Require x5c claim if CA Store in config.
- Add second header image and link.

## 6.0.2 - 2024-03-13

### Fixed
- Add new link to config for home.

### Changed
- Temporarily disable translate button.

## 6.0.1 - 2024-03-05

### Fixed
- Ensure challenge is being included in verification.

## 6.0.0 - 2024-02-29

### Changed
- Use Bedrock packages.
- **BREAKING**: Move config location to `/etc/bedrock-config/combined.yaml`.
- **BREAKING**: Remove `opencred.dbConnectionUri` configuration. MongoDB options
  should be specified via `config.mongodb`.
- **BREAKING**: Remove `opencred.domain` configuration. HTTP Server options
  should be specified via `config.server` and `config.express`.
- Move OID4VP login pages into single page.
- Pin quasar to version 2.14.5.

## 5.4.3 - 2024-02-07

### Fixed
- Add explicit return to all responses.

## 5.4.2 - 2024-02-07

### Changed
- Use `@digitalbazaar/vdl-context@1`.
- Use `@digitalbazaar/vdl-aamva-context@1`.
- Use `@digitalbazaar/did-method-web` for `did:web` resolution.

### Fixed
- Improve error handling in HTTP handlers.

## 5.4.1 - 2024-01-25

### Changed
- Clear credential status lookup interval after redirect.

## 5.4.0 - 2024-01-24

### Added
- Add optional config for customizing UI exchangeProtocols order.

## 5.3.2 - 2024-01-23

### Changed
- File size limit on url encoded content increased from 100kb to 200kb.

## 5.3.1 - 2024-01-22

### Changed
- Use `@digitalbazaar/did-method-jwk@1`.
- File size limit on json increased from 100kb to 200kb.

## 5.3.0 - 2024-01-11

### Added
- Verification of x509 certificates in did:jwk x5c claim.
- Added load testing script.

### Changed
- Added index on exchange id.
- Removed unnecessary imports.

## 5.2.3 - 2023-12-07

### Fixed
- Verify VC within VC-JWT presentation.

## 5.2.2 - 2023-12-06

### Fixed
- Fix `iat` and `exp` claim in `id_token`.

## 5.2.1 - 2023-12-06

### Fixed
- Fix bug with nonce value in OID4VP request.
- Fix aud claim in id_token.

## 5.2.0 - 2023-12-05

### Added
- Add support for loading the config from a Base64 encoded environmental
  variable: OPENCRED_CONFIG.
- Add RS256 signing key.

## 5.1.0 - 2023-12-04

### Fixed
- Revert to `node:20-alpine` in Dockerfile.

### Added
- Native OID4VP flow works with VC-JWT.

## 5.0.5 - 2023-11-22

### Fixed
- Fix database test data generation and workflow-client connection.

## 5.0.4 - 2023-11-22

### Fixed
- Fix token endpoint code query.

## 5.0.3 - 2023-11-22

### Fixed
- Redirect to client `redirect_uri` after exchange is complete.
- Generate TTL Index for Entra exchanger.

### Changed
- Organize OIDC data in database into `oidc` document property.
- Add database index for `oidc.code` (partial, on existing values).

## 5.0.2 - 2023-11-21

### Fixed
- Fix `client_id` generation issue when behind certain load balancers.

## 5.0.1 - 2023-11-20

### Fixed
- Improve Microsoft Entra Verified ID error handling.

## 5.0.0 - 2023-11-17

### Changed
- New config variables.

### Added
- Add `openid-configuration` and JWKS endpoints
- Configure `prime256v1` EC keys for JWT signing
- Sign `id_tokens` to complete OpenID Connect Login flow

## 4.0.1 - 2023-11-16

### Fixed
- Fix Entra API verification and access token requests.

## 4.0.0 - 2023-11-16

### Changed
- **BREAKING**: Config change to use consistent property casing. Requires a
  config update.

### Added
- Optionally serve a `did:web` DID document.
- Optionally serve a did-configuration document with DomainLinkageCredentials.
- Microsoft Entra Verified ID exchange type.
- New configFrom property to enable relying party inheritance.

### Fixed
- Use client-specific theme information in the UI to enable multiple clients to
  use the same install of OpenCred.
- Made ID Regex in endpoints less restrictive.
- Moved results into proper step.
- Removed unused 'custom' exchange type.

## 3.0.2 - 2023-11-03

### Fixed
- Use the MongoDB database name specified in the URL connect string.

## 3.0.1 - 2023-11-03

### Fixed
- Resolves an error with new npm installs related to an old version of `ky`.

## 3.0.0 - 2023-11-03

### Added
- Native OID4VP exchanges
- Mongo database
- Document loader
- did:jwk support
- API endpoints
- API authentication
- API documentation with OpenAPI

## 2.0.5 - 2023-10-17

### Fixed
- Pin to `node:20.8.0-alpine3.18`.
- Revert to `ezcap@4`.

## 2.0.4 - 2023-10-17

### Fixed
- Use debug branch of `ezcap`.

## 2.0.3 - 2023-10-17

### Fixed
- Add error logging.

## 2.0.2 - 2023-10-17

### Fixed
- Add logging.
- Adjust `CMD` in Dockerfile.

## 2.0.1 - 2023-10-16

### Fixed
- Fix syntax error in Dockerfile.

## 2.0.0 - 2023-10-16

### Changed
- Add basic flows.

## 1.0.1 - 2023-09-07

### Fixed
- Fix container image name.

## 1.0.0 - 2023-09-07

### Added
- Initial release, see individual commits for history.
