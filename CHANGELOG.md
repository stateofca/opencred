# opencred-platform Changelog

## 5.3.1 - 2024-01-22

### Changed
- Use `@digitalbazaar/did-method-jwk@1`.
- File size limit increased from 100kb to 200kb.

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
