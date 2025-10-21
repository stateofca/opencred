# opencred-platform Changelog

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
