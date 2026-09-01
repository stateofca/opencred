<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

# OpenCred architecture map

A navigation map for making changes with confidence. It tells you **which
file(s) to touch** for a given change across the three surfaces — web UI,
config, and backend — plus the request lifecycle that connects them.

> **Status:** living document. Update it in the same PR as any change that
> would make it wrong or incomplete — a new, moved, or renamed file belonging
> to an inventory below, a new route, config key, workflow, interaction
> component, or composable, or a change to the request lifecycle or to which
> file owns a behavior. Bump the date below when you do, and add a Change log
> entry. Last verified against `main` on 2026-09-01.
>
> **Scope:** this repo is the product. Per-deployment config — workflows,
> branding, copy overrides — is not here; see
> [Deployment config](#11-deployment-config).

---

## 1. The three surfaces (start here)

| I want to change… | Go to |
|---|---|
| On-screen text / button labels | [Copy & i18n](#7-copy-i18n) — usually **config**, not code |
| A wallet screen (QR, DC API, CHAPI) | [Web UI → interaction components](#web-ui-interaction-components-webcomponentsinteractions) |
| Which wallets / methods are offered | [Wallets & picker](#wallets-the-picker-commonwallets) — `common/` + config |
| Branding / theme / logo | [Theming](#6-shared-code-common) |
| An OID4VP request field or profile | [Backend → OID4VP](#libworkflows) |
| Presentation verification | [Backend → verification](#libworkflows) |
| OIDC / token behavior | [Backend → OIDC](#lib-top-level) |
| A workflow config field | [Config schema](#5-config-configs) |
| A default translation string | [Copy & i18n](#7-copy-i18n) |
| An API endpoint / route | `lib/http.js` — [route registration](#9-routes) |

**Golden rule for copy:** most user-visible text is an **i18n key** resolved
from config, not a literal string in the Vue components. Change wording in the
deployment config's `translations` block, not in `web/`. Only the **default**
value of a key lives in this repo, at `common/i18n/en.json`.

---

## 2. Repo layout

```
src/
├── web/          Vue 3 + Quasar SPA (the browser UI)
├── lib/          bedrock/Node backend (endpoints, workflows, verification)
├── common/       code shared between web and lib (wallets, profiles, i18n, utils)
├── configs/      config schema (Zod), loading, and bedrock wiring
├── docs/         these docs (00-configure-workflow.md, etc.)
├── test/         unit (test/unit/**, 83 files) + bedrock integration (test/bedrock/**, 40)
├── scripts/      generate:config, key/cert generators, sample-oidc-rp.js
├── dev.js        local entry point (loads configs/combined.yaml → BEDROCK_CONFIG)
└── test.js       test entry point
```

`dev.js` reads `configs/combined.yaml`, base64-encodes it into
`BEDROCK_CONFIG`, and calls `bedrock.start()`. `combined.yaml` is a **local,
gitignored** file (it holds signing keys) — do not read or edit it via tooling.

---

## 3. Web UI (`web/`)

Vue 3 SPA. Bootstrap in `web/index.js`: fetches `/config/app.json` (line 35),
builds the router (50–79), sets up i18n from `appConfig.translations` (84–88),
applies theme from `appConfig.brand` (103–105) via `pickBrandColors`
(`web/utils/brand.js`).

### Top-level
- `web/index.js` — app bootstrap, router, i18n init, theme.
- `web/App.vue` — root router-view wrapper (responsive card).
- `web/chapi.js` — CHAPI polyfill; `getCredentials({protocols})`.

### Views (`web/views/`)
- `HomeView.vue` — workflow-listing grid when `workflowListingEnabled`.
- `LoginView.vue` — OIDC login flow; renders `OpenCredExchange` until complete.
- `VerificationView.vue` — verification flow; success view on complete.
- `AuditPresentation.vue` — manual VP audit tool.

### Components (`web/components/`)
- `OpenCredExchange.vue` — **core orchestrator**; polls exchange status every
  5s (line 363), renders the interaction, handles error/expiry/reset.
- `WalletInteraction.vue` — routes to the active interaction component by
  `activePickerEntry.method` (lines 11–46).
- `InteractionPickerModal.vue` — the "choose a connection method" modal.
- `WalletLaunchButton.vue` — reusable launch button (link or DC API).
- `SuccessDetails.vue` — renders `exchangeData.successViewFields` after success.
- `CredentialQuerySummary.vue` — shows requested credential types.
- `SuggestedApps.vue` — compatible-wallet list with app-store badges.
- `AppLayout.vue` — header/logo/footer shell; sets page title & brand.
- `ErrorView.vue`, `CountdownDisplay.vue`, `ModalDialog.vue`,
  `AppSettingsModal.vue`, `ReCaptcha.vue`, `TranslateIcon.vue`,
  `YouTubeVideo.vue` — supporting UI.
- `DebugDisplay.vue`, `DebugInfoPanel.vue`, `DebugTranslationsPanel.vue` —
  dev-only panels (Shift+/ to toggle).

### Web UI → interaction components (`web/components/interactions/`)
One component per connection method; `WalletInteraction.vue` picks which:
- `DcApiInteraction.vue` — Digital Credentials API (`navigator.credentials.get`).
  One button per launch descriptor; **desktop vs mobile label** switch at ~86.
- `QrAndLinkInteraction.vue` — QR + same-device launch link. Desktop shows QR
  by default (`showQrCode = !isMobile`); mobile shows the launch button.
- `QrAndCopyInteraction.vue` — QR + copy-URL (wallets without deep links).
- `ChapiInteraction.vue` — CHAPI same-device; calls `chapi.js`.

### Composables (`web/composables/`)
- `useExchangeContext.js` — **singleton**; fetches `/context/{route}` or
  `/context/continue?exchange_token=…`; provides `workflow`, `translations`,
  `brand`, `exchangeData`, `exchangeState`.
- `useExchange.js` — facade combining the composables below.
- `useExchangeOptions.js` — computes picker entries (calls
  `computeExchangeOptions` in `common/wallets/exchange-options.js`).
- `useWalletInteraction.js` — active picker-entry selection state.
- `useDcApiLaunch.js` — DC API launch state + `launch(descriptor)`.
- `usePlatform.js` — `isIOS`/`isAndroid`/`isMobile` via Quasar `$q.platform`;
  `dcApiSystemAvailable`.
- `useExchangeSettings.js` — user settings (enabled wallets/profiles) from
  localStorage.
- `useReactiveI18n.js` — merges workflow translations + debug overrides into a
  local i18n scope; `te(key)` existence check.
- `usePickerReporting.js` — picker funnel-event reporting.
- `useDebug*.js`, `useWindowPopup.js` — debug + popup helpers.

### Utils (`web/utils/`)
- `dcapi.js` — DC API orchestration; `startDcApiFlow` calls
  `navigator.credentials.get(DigitalCredential)`.
- `protocols.js` — protocol registry (names/descriptions).
- `events.js` — `reportExchangeEvent(...)` posts funnel events.
- `brand.js` — `pickBrandColors` selects the color fields (`BRAND_COLOR_FIELDS`:
  cta, primary, header) from a brand into `--q-*` Quasar variables.
- `dc-api-error-message.js`, `exchange-expiry.js`, `switch-link.js`,
  `debug-info.js`, `debug-translations.js` — helpers.

### Common web change → file(s)
- **Interaction screen** (new/modify): edit the `*Interaction.vue`; a new method
  also needs registration in `WalletInteraction.vue` (11–46) and picker-entry
  logic in `common/wallets/exchange-options.js`.
- **Picker behavior**: UI in `InteractionPickerModal.vue`; entries in
  `useExchangeOptions.js` → `exchange-options.js`; visibility via
  `workflow.connectionPickerEnabled`.
- **Routing / new view**: route table in `web/index.js` (51–76).
- **Brand color / theme**: `web/utils/brand.js` (`pickBrandColors`) feeds the
  global theme in `web/index.js` and per-workflow colors in
  `useExchangeContext.js`; the header rebinds `--q-primary` in `AppLayout.vue`
  (`headerColorStyle`).
- **Success display**: `SuccessDetails.vue` + the view (`VerificationView.vue` /
  `LoginView.vue`).
- **Desktop vs mobile**: `usePlatform.js` (`isMobile`); example in
  `DcApiInteraction.vue`.

---

## 4. Backend (`lib/`)

bedrock/Node service. **All routes are registered in `lib/http.js`** on the
`bedrock-express.configure.routes` event.

### `lib/` (top level)
- `http.js` — **route registration** (all endpoints) + Express setup.
- `api.js` — frontend API handlers: `initiateExchange`, `getExchangeStatus`,
  `getConfig` (serves `/config/app.json`; resolves `brand` from the workflow or
  the deployment default).
- `oidc.js` — OIDC endpoints: `validateOidcLoginMiddleware`,
  `exchangeCodeForToken`, `jwksEndpoint`, `openIdConfiguration`.
- `callback.js` — POSTs completed exchange data to `workflow.callback.url`.
- `auth.js` — auth middleware (Basic/Bearer/body) for workflow credentials.
- `resolveClient.js` — workflow lookup by clientId/workflowId + middleware.
- `redirect-uri.js` — OIDC redirect-URI whitelist validation.
- `audit.js` — standalone VP-token audit endpoint.
- `didWeb.js` — `did:web` document + did-configuration endpoints.
- `database.js` — Mongo collections (`Exchanges`, `DidDocumentHistory`,
  `RootCertificates`) + indexes.
- `index.js` — module entry; starts bedrock + sanity checks.
- `logger.js` / `logger/events/*` — structured logging + per-event builders.
- `wallet-cert-sanity-startup.js` — startup wallet-cert check.

### `lib/workflows/`
- `get-workflow-service.js` — **factory**: routes workflow `type` → service.
- `base.js` — `BaseWorkflowService`: exchange CRUD, TTL/expiry, middleware.
- `native-workflow.js` — `NativeWorkflowService`: OID4VP / DC API / mdoc;
  `authorizationRequestMiddleware`, `authorizationResponseMiddleware`.
- `vc-api-workflow.js` — legacy VC-API protocol.
- `entra-verified-id-workflow.js` — Microsoft Entra Verified ID.
- `common.js` — shared exchange helpers (QR protocol resolver, result tokens,
  `successViewFields`, scrubbing).

### `lib/workflows/common/` (OID4VP internals)
- `oid4vp.js` — **builds** authorization requests (`presentation_definition`,
  `dcql_query`, `vp_formats`); the `TEMPLATES` profile→component map.
- `oid4vp-shared.js` — **verifies** submissions (`verifyJwtSubmission`,
  `verifyLdpSubmission`).
- `oid4vp-dispatcher.js` — routes request/response to the profile handler
  (`REQUEST_HANDLERS` / `RESPONSE_HANDLERS`).
- `identify-profile.js` — resolves the requested profile name → profile config.
- `oid4vp-formats.js` — format descriptors (jwt_vc_json, ldp_vc, mso_mdoc).
- `client-metadata.js`, `jar-signing.js` — OID4VP client metadata + JAR signing.
- `dc-api-envelope.js`, `dc-api-pending-requests.js`,
  `dc-api-response-resolver.js` — DC API request/response plumbing.
- `mdoc-device-request.js`, `mdoc-reader-auth.js`, `session-transcript.js`,
  `serialize-origin.js` — ISO 18013-7 mdoc pieces.
- `type-expansion.js` — JSON-LD type expansion for queries.
- `wallet-cert-sanity.js`, `wallet-certificates.js` — wallet root-cert handling.

### `lib/workflows/profiles/`
One file per OID4VP profile (request/response handlers), e.g.
`native-oid4vp-standard.js`, `native-oid4vp-haip-1.0.js`,
`native-18013-7-annex-{b,c,d}.js`, `native-cadmv-{android,ios}.js`,
`native-google-wallet.js`, `native-spruceid-18013-7.js`, `native-vcapi.js`.
Register a new one in `oid4vp-dispatcher.js`.

### `lib/did/`, `lib/credential-status/`
- `did/jwk-jcs-pub.js` — jwk_jcs-pub `did:key` decode/resolve (canonical gate;
  `acceptNonCanonical` opt-in).
- `did/did-key.js` — did:key utilities.
- `credential-status/index.js` — status-check routing (BitstringStatusList vs
  the deprecated TWDIW `twdiw-status-list-2021.js`).

### Backend change → file(s)
- **OID4VP request field**: `lib/workflows/common/oid4vp.js`.
- **OID4VP profile** (add/modify): `lib/workflows/profiles/native-<p>.js` +
  register in `oid4vp-dispatcher.js`.
- **Verification**: `lib/workflows/common/oid4vp-shared.js` (or
  `common/vcalm.js` for LDP).
- **Workflow type**: new `lib/workflows/<type>-workflow.js` + register in
  `get-workflow-service.js`.
- **OIDC / token**: `lib/oidc.js` (or `common/oidc.js` `jwtFromExchange`).
- **DID resolution**: `lib/didWeb.js`, `lib/did/*`, or
  `common/documentLoader.js`.
- **API endpoint**: route in `lib/http.js` + handler in `lib/api.js` or a
  workflow service.
- **Callback**: `lib/callback.js`.

---

## 5. Config (`configs/`)

`.js` files here define the **schema and loading**, not the deployment values.

- `config.js` — orchestrator; validates `config.opencred` via Zod on
  `bedrock.init`, applies workflow defaults, ensures uniqueness.
- `config-utils.js` — **Zod schemas + inheritance**. This is where workflow
  fields are declared and validated.
- `translation.js` — loads defaults from `common/i18n/*.json`, merges custom.
- `authorization.js` — OAuth client entries from `callback.oauth`.
- `core.js`, `database.js`, `express.js`, `server.js`, `https-agent.js`,
  `paths.js` — bedrock subsystem settings.

### Schemas (in `config-utils.js`)
- `BaseWorkflowSchema` — shared workflow fields (clientId, brand, dcApiEnabled,
  `dcApiButtons`, `connectionOptions`, `oid4vpProfile`,
  `acceptNonCanonicalJwkJcsPub`, translations, `successViewFields`, …).
- `OptionsSchema` — global `options` (exchangeProtocols, wallets,
  `OID4VPdefault`, TTLs, `acceptNonCanonicalJwkJcsPub`, …).
- Per type: `NativeWorkflowSchema`, `VcApiWorkflowSchema`, `EntraWorkflowSchema`,
  `PresetWorkflowSchema`.
- `OpenCredConfigSchema` — top-level (options, workflows, signingKeys, didWeb,
  audit, caStore, …).

### Inheritance (`configFrom`)
`resolveConfigFrom` copies fields named in **`INHERITABLE_FIELDS`** from a
parent workflow onto a child that omits them; `applyWorkflowDefaults` runs it
per workflow. Type-specific fields (query, dcql_query, …) are **not** inherited.
Translations merge per-locale via `mergeTranslations`. A field only inherits if
its name is in `INHERITABLE_FIELDS`.

### Validation helpers
`validateDcApiButtons`, `validateConnectionOptions`, `validateSigningKeys`,
`validateWalletCertificates`, `fillPublicKeysFromCertificates`
(config-utils.js); `validateWorkflowIdentifiers` (config.js).

`publicKeyPem` is optional wherever a `certificatePem` is supplied — it is
derived from the certificate — and a key that does not match its certificate
warns at startup. A wallet certificate that fails to parse **throws**, so a
config with an unusable wallet key does not start.

---

## 6. Shared code (`common/`)

Imported by both web and lib.

### Wallets & the picker (`common/wallets/`)
- `exchange-options.js` — **the core picker logic**: `computeExchangeOptions`
  builds picker entries and DC API launch descriptors; `_handledBy` builds the
  "handled by" hints; `_configuredDescriptors` builds descriptors from
  `dcApiButtons` (carries `labelKey` / `desktopLabelKey`).
- `wallets-registry.js` — the `WALLETS_REGISTRY` (cadmv-android, cadmv-ios,
  apple-wallet, google-wallet, lcw).
- `apple-wallet.js`, `google-wallet.js`, `cadmv-android.js`, `cadmv-ios.js`,
  `lcw.js` — per-wallet config (`supportedProfiles`, formats, platform).
- `profile-format-mapping.js`, `canShowOption.js` (legacy), `index.js`.

### Profiles & methods
- `profiles.js` — `PROFILES_LIST` + `PROFILE_METADATA` i18n keys.
- `interaction-methods.js` — `INTERACTION_METHODS_LIST` (qr, link, dcapi,
  chapi), same-device vs cross-device sets.

### i18n
- `i18n/en.json` — **default** English strings (the fallback for every key).
  Deployment configs override these in their `translations` block.

### Verification / utils
- `utils.js` — `verifyCredential`/`verifyPresentation`, JWT/JSON checks,
  JSONPath, X.509 chain (`verifyChain` in `x509.js`).
- `documentLoader.js` — JSON-LD loader + `didResolver` (cached, process-wide;
  did:key/jwk/web); `getDocumentLoader()`.
- `oidc.js` — `jwtFromExchange` (builds the id_token).
- `mdoc.js`, `classifyOid4vpSubmission.js`, `oid4vp-utils.js`, `vcalm.js`,
  `suites.js`, `audit.js`, `dcapi.js`, `userAgent.js`, `zcap.js`,
  `presets/Iso18013DriversLicenseCredential.js`.

### Common config/i18n change → file(s)
- **Add a wallet**: new `common/wallets/<id>.js` → add to `wallets-registry.js`
  → add to `availableWallets` in `config-utils.js` → optional
  `wallet_<id>_name` key in `en.json`.
- **Default translation string**: `common/i18n/en.json`.
- **Workflow config field**: schema in `config-utils.js` (base vs type-specific)
  → add to `INHERITABLE_FIELDS` if it should inherit.
- **Methods/profiles offered**: `profiles.js`, `interaction-methods.js`,
  `exchange-options.js` (`staticInteractionMethodsForProfile`).
- **Wallet compatibility / handled-by**: per-wallet `supportedProfiles` +
  `exchange-options.js` (`_walletCompat`, `_profileCompat`, `_handledBy`).

---

## 7. Copy & i18n

Every user-visible string is an i18n **key**. Resolution order:
1. **Default** value — `common/i18n/en.json` (this repo).
2. **Deployment override** — the workflow's `translations.en` block in the
   config repo. Overrides the default per key.
3. **Debug override** — live in-browser edits (dev only).

The frontend gets keys from `/config/app.json` (global) and per-route
`/context/{route}` (workflow-specific), merged by `useReactiveI18n.js`.

**To change wording a user sees:** edit the key in the **deployment config's**
`translations` block (config repo), not in `web/`. Change `en.json` only when
you mean to move the product-wide default.

---

## 8. Request lifecycle (OIDC login → presentation → callback)

1. **Login** `GET /context/login` → `resolveClient` → `validateOidcLoginMiddleware`
   (`oidc.js`) → create-or-get exchange.
2. **Exchange created** — `BaseWorkflowService.createExchange` (`base.js`) →
   Mongo insert, state `pending`.
3. **Authorization request** `GET/POST …/authorization/request` →
   `NativeWorkflowService.authorizationRequestMiddleware` → `identifyProfiles`
   (`identify-profile.js`) → `oid4vp-dispatcher` → profile handler → `oid4vp.js`
   builds the request (JWT/JSON).
4. **Wallet fetches** the request.
5. **Wallet submits** `POST …/authorization/response` →
   `authorizationResponseMiddleware`.
6. **Verify** — dispatcher → profile handler → `oid4vp-shared.js`
   (`verifyJwtSubmission` / `verifyLdpSubmission`) → `common/utils.js` /
   `vcalm.js`.
7. **Handle presentation** — extract claims → `exchange.variables.results[step]`.
8. **Callback** — `callback.js` POSTs to `workflow.callback.url`.
9. **Token** `POST /token` → `exchangeCodeForToken` (`oidc.js`) →
   `jwtFromExchange` (`common/oidc.js`) → id_token.
10. **Complete** — RP receives code, exchanges for id_token, user authenticated.

---

## 9. Routes

Registered in `lib/http.js`. Key groups:
- **Well-known**: `/.well-known/did.json`, `/.well-known/jwks.json`,
  `/.well-known/openid-configuration`.
- **Frontend API**: `/config/app.json`, `/context/login`,
  `/context/verification`, `/context/continue`,
  `/workflows/:workflowId/exchanges` (POST create, GET detail, POST reset).
- **OID4VP**: `…/openid/client/authorization/request` (GET/POST),
  `…/authorization/response` (POST).
- **OIDC**: `POST /token`.
- **Events**: `…/exchanges/:exchangeId/events` (POST; client-reported DC API
  outcomes).
- **Entra**: `/verification/callback` (POST).
- **Audit**: `/audit-presentation` (POST).

---

## 10. Tests

- **Unit** (`test/unit/**`, run with `npm run test:unit` → mocha): pure logic,
  schemas, descriptor builders. Mirrors source layout (`configs/`, `wallets/`,
  `workflows/`, `web/`). Add tests here for functional-core changes.
- **Bedrock integration** (`test/bedrock/**`, `npm run test:bedrock`): full
  server, endpoints, DB.
- **Not covered by unit tests:** Vue component runtime behavior needing Quasar
  `$q.platform` (e.g. the desktop/mobile label switch) — verify those in the
  live UI.

Run everything with `npm test`. Lint with `npm run lint` (eslint).

---

## 11. Deployment config

Workflows, branding, and copy overrides are **not** in this repo. They live in
whatever config a deployment loads at startup — a local `configs/combined.yaml`,
or the `BEDROCK_CONFIG` / `BEDROCK_CONFIG_GZIP` environment variable in a
deployed environment. See
[00-configure-workflow.md](00-configure-workflow.md) for how a config is
written and loaded, and the repository README for the environment variables.

What that means when using this map:

- A change to on-screen text, a workflow's query, its branding, or which
  wallets it offers is a **config** change. This map tells you which code
  *reads* those keys, not where their values are set.
- A change to how a key behaves is a **code** change here.
- A user-visible change is therefore often **two changes**: the mechanism in
  this repo, and the config that uses it. They ship separately, so a mechanism
  can be live with no config using it yet, and vice versa.

Where a deployment keeps its config, and how it is reviewed and released, is
that deployment's concern. Some render it from a template and hold it in a
separate repository; the rendered result is what this application consumes.

> A rendered config embeds live signing keys and client secrets. Treat any
> rendered output as secret: never commit it, paste it, or read it through
> tooling that logs its input.

---

## Change log

- 2026-09-01 — Verified against `main` after the brand-color fix. Added
  `web/utils/brand.js` (`pickBrandColors`) and the brand/theme change→file
  entry; noted the `getConfig` brand resolution and the `AppLayout.vue` header
  color rebinding; corrected the `web/index.js` bootstrap line numbers and the
  unit/bedrock test counts (83 / 40).
- 2026-08-30 — Verified against `main`. Generalized §11 to describe how
  config reaches the app rather than one deployment's repos; added the
  signing-key and wallet-certificate validation helpers; corrected the
  unit-test count and the in-page anchor links.
- 2026-08-20 — Initial map created.
