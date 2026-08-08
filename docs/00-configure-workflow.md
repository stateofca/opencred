# How to Configure a Workflow in OpenCred Using a Native Exchange

## Introduction

In this guide, we will configure OpenCred to set up a workflow that will handle
requests from a relying party (an external application that connects to OpenCred
via OpenID Connect). The workflow will request a "VerifiedEmailCredential" from
users. We will setup OpenCred to be run locally using a **native** workflow.

## Prerequisites

Ensure you have:

- OpenCred cloned from [Github](https://github.com/stateofca/opencred)
- Node.js v22 or higher
- Dependencies installed (`npm install`)
- The necessary `VerifiedEmailCredential` to be presented when a relying party
  requests it through the workflow.

## Steps

### 1. Prepare the Configuration File

Copy the example configuration file to the required location:

```sh
cp configs/config.example.yaml configs/config.yaml
```

Whenever changes are made to the `config.yaml` you will need to export an
environment variable:

```sh
export BEDROCK_CONFIG=$(cat configs/config.yaml | base64)
```

### 2. Run a Local Tunnel

For the wallet to communicate with your local OpenCred server, install and run
`localtunnel`:

```sh
npm install -g localtunnel
npm run tunnel
```

### 3. Update the Configuration File

Edit the `configs/config.yaml` file and update the details of the
OpenCred deployment.

- Input the full local tunnel URI as the `app.server.baseUri` property.
- If the VC to be verified includes an x509 certificate (x5c claim), input the
  certificate in the `pem` property under `caStore`. If not, remove the
  `caStore` property and its children.

If you need to keep the `caStore` for workflows that may interact with different
relying parties, you can selectively bypass the CA checks.

### 4. Configure the Workflow

Remove all of the example workflows under the `workflows` section and
add a new entry for your workflow with a `native` workflow type. This workflow
configuration defines how OpenCred will interact with external relying parties
that connect via OpenID Connect. Example:

```yaml
workflows:
  - clientId: example-client
    clientSecret: example-secret
    type: native
    oidc:
      redirectUri: http://localhost:8080/oidc/callback
      claims:
        - name: email
          path: credentialSubject.email
    query:
      - type:
          - VerifiedEmailCredential
        context:
          - "https://www.w3.org/2018/credentials/v1"
        format:
          - jwt_vc_json
```

#### Redirect URIs

When a relying party uses more than one callback URL, set `redirectUri` to a list of URLs. Each entry must be a valid URL.

```yaml
    oidc:
      redirectUri:
        - http://localhost:8080/oidc/callback
        - https://app.example.com/oidc/callback
      claims:
        - name: email
          path: credentialSubject.email
```

On `GET /context/login`, the `redirect_uri` query parameter must match one of
these values. OpenCred stores that URI on the exchange and redirects the user
back to it after a successful wallet presentation.

#### Legacy Workflow Identifier (Deprecated)

If you are migrating from an earlier version of OpenCred where API clients
used a different identifier (slug) in URL paths, you can set `workflowId`
on a workflow to preserve backward compatibility:

```yaml
workflows:
  - clientId: my-new-uuid-style-id
    clientSecret: my-secret
    workflowId: my-old-slug
    type: native
    # ...
```

When `workflowId` is set, clients can use either `clientId` or `workflowId`
in URL paths (e.g., `POST /workflows/my-old-slug/exchanges`) and in Basic
authentication. The `clientId` takes precedence: if two workflows have a
matching `clientId` and `workflowId` for the same identifier, the `clientId`
match wins.

**Constraints:**

- `workflowId` is optional; omit it for new workflows.
- Must match `^[a-zA-Z0-9_-]+$` (alphanumeric, hyphens, underscores).
- Must be unique across all workflows.
- Cannot be the same as another workflow's `clientId` (a warning is logged
  on startup if this occurs).
- Not inherited via `configFrom`.

#### Workflow Inheritance with `configFrom`

A workflow can inherit shared base fields from another workflow by setting
`configFrom` to the parent's `clientId`:

```yaml
workflows:
  - clientId: my-base
    clientSecret: base-secret
    type: native
    brand:
      cta: "#006847"
      homeLink: https://example.com
    translations:
      en:
        copyright: "© 2026 Example"
        appTitle: Base App
    query:
      - type:
          - VerifiableCredential

  - clientId: my-child
    configFrom: my-base
    type: native
    translations:
      en:
        appTitle: Child App
        qrPageExplain: Scan with your wallet
    query:
      - type:
          - VerifiedEmailCredential
```

**Inherited fields:** `name`, `description`, `brand`, `caStore`, `dcApiEnabled`,
`interactEnabled`, `wallets`, `dcApiButtons`, `connectionOptions`,
`connectionPickerEnabled`, `oidc`,
`callback`, `translations`, `trustedCredentialIssuers`,
`untrustedVariableAllowList`, `public`, `clientSecret`.

**Deep-merge behavior:**

- **`brand`** is deep-merged in three levels: `defaultBrand` ← parent brand ←
  child brand. Partial overrides are additive.
- **`translations`** is deep-merged per locale. Within each locale, the child's
  keys override the parent's; parent-only keys are preserved. Locales absent
  on the child are inherited wholesale. In the example above, the resolved
  `translations.en` for `my-child` would be:
  `{copyright: '© 2026 Example', appTitle: 'Child App', qrPageExplain: 'Scan with your wallet'}`.
- All other inherited fields use **shallow replacement**: if the child defines
  the field, the child's value wins entirely.

**Constraints:**

- Only one level of inheritance is allowed (a `configFrom` target must not itself
  use `configFrom`).
- Fields related to the credential query (e.g., `query`, `dcql_query`,
  `verifiablePresentationRequest`) are never inherited.

### 5. Generate and Configure the `id_token` Signing Key

Generate a new RSA key with purpose `id_token`.

```sh
npm run generate:rsa256 id_token
```

Add the signing key in the `signingKeys` section:

```yaml
signingKeys:
  - type: RS256
    id: your-key-id
    privateKeyPem: |
      -----BEGIN PRIVATE KEY-----
      ...
      -----END PRIVATE KEY-----
    publicKeyPem: |
      -----BEGIN PUBLIC KEY-----
      ...
      -----END PUBLIC KEY-----
    purpose:
      - id_token
```

### 6. Generate and Configure the `authorization_request` Signing Key

Generate a new P-256 key with purpose `authorization_request`.

```sh
npm run generate:prime256v1 authorization_request
```

Add the signing key in the `signingKeys` section:

```yaml
signingKeys:
    ...
  - type: ES256
    id: your-key-id
    privateKeyPem: |
      -----BEGIN PRIVATE KEY-----
      ...
      -----END PRIVATE KEY-----
    publicKeyPem: |
      -----BEGIN PUBLIC KEY-----
      ...
      -----END PUBLIC KEY-----
    purpose:
      - authorization_request
```

#### mDL query fields (`fields` / `fieldsToRetain`)

For `mso_mdoc` query items, `fields` lists the namespace → field names to
request from the holder. The optional `fieldsToRetain` alternative uses the same
shape and declares which of those claims the verifier intends to retain after
the transaction (ISO/IEC 18013-5 §8.3). You don't need to include a retained
field in both lists. The requested claim set per namespace is the **union** of
`fields[ns]` and `fieldsToRetain[ns]`; each claim's
`intent_to_retain` flag is `true` only when the field appears in
`fieldsToRetain[ns]`, otherwise `false`. Omitting `fieldsToRetain`
keeps the legacy behavior (`intent_to_retain: false` for every
claim).

```yaml
query:
  - fields:
      org.iso.18013.5.1:
        - given_name
        - family_name
        - document_number
    fieldsToRetain:
      org.iso.18013.5.1:
        - given_name
        - family_name
        - document_number
    format:
      - mso_mdoc
```

## Apple Wallet reader authentication (Annex C)

Apple Wallet requires reader authentication on `mso_mdoc`
DeviceRequests issued through the Digital Credentials API
(ISO/IEC 18013-7 Annex C). You need to obtain a reader-auth
certificate from Apple Business Connect and install it as a
`walletCertificates` entry.

### Obtain a certificate

1. Generate an EC P-256 key pair. Store it securely so that it may sign the CSR
   and may be rendered into OpenCred config along with the Certificate you
   obtain from Apple in your deployed environment.
2. Produce a CSR per Apple's "Requesting a mobile document on the
   web" documentation:
   https://developer.apple.com/documentation/digitalcredentials/requesting-a-mobile-document-on-the-web
   The CSR must use EC P-256 with SHA-256 per Apple Business requirements.
3. Submit the CSR through Apple Business. Apple returns a
   leaf certificate. Collect the intermediate(s) from Apple's
   published chain.

### Install the certificate

Add a `walletCertificates` entry under `opencred:`. Each entry
inlines the key pair and the PEM cert chain (leaf first):

```yaml
opencred:
  walletCertificates:
    - wallet: apple-wallet
      id: apple-2026
      type: ES256
      displayName: Apple Wallet reader 2026-Q2
      privateKeyPem: |
        -----BEGIN PRIVATE KEY-----
        ...your EC P-256 key...
        -----END PRIVATE KEY-----
      publicKeyPem: |
        -----BEGIN PUBLIC KEY-----
        ...matching public key...
        -----END PUBLIC KEY-----
      certificatePem: |
        -----BEGIN CERTIFICATE-----
        ...leaf cert issued by Apple Business...
        -----END CERTIFICATE-----
        -----BEGIN CERTIFICATE-----
        ...intermediate cert(s), leaf-first...
        -----END CERTIFICATE-----
```

Multiple entries with `wallet: apple-wallet` are allowed. OpenCred
signs every outgoing Annex C request with _all_ matching entries in
config array order and emits them as `readerAuthAll`. Use this to
roll keys without downtime: add the new entry, wait for clients to
accept, then remove the old one.

Entries whose `notBefore`/`notAfter` are out of bounds still sign
but emit warnings. Prune them before clients start rejecting.

### Request flow

Set the request's `profile` query parameter to `apple-wallet`:

```
POST /workflows/{id}/exchanges/{id}/openid/client/authorization/request?profile=apple-wallet
```

OpenCred responds with a ready-to-send `dcApiRequest` envelope
containing the spec-conformant, ReaderAuth-signed DeviceRequest.

For backward compatibility, `profile=18013-7-Annex-C` remains
supported; it produces the same DeviceRequest shape but _without_
`readerAuthAll`. Clients that don't require reader authentication
may continue to use that profile.

The `profile=apple-wallet` flow requires `walletCertificates` and emits
`readerAuthAll`. The generic `profile=18013-7-Annex-C` remains unsigned
for backwards compatibility.

## Configure Google Wallet (OID4VP 1.0, x509_hash)

Google Wallet supports OID4VP 1.0 with signed JAR requests and
encrypted responses. OpenCred uses a certificate registered with
Google to sign requests and identify your relying party via the
`x509_hash` client_id scheme.

### Obtain a certificate

1. Generate an EC P-256 key pair. Store it securely so that it may
   sign the CSR and may be rendered into OpenCred config along with
   the certificate you obtain from Google in your deployed
   environment.
2. Create a standard X.509 certificate from the key pair.
3. Register your public certificate with Google Wallet by contacting
   `wallet-identity-rp-support@google.com` or following Google's
   [RP Onboarding](https://developers.google.com/wallet/identity/verify/accepting-ids-from-wallet-online)
   process. Onboarding typically takes 3–5 business days.

### Install the certificate

Add a `walletCertificates` entry under `opencred:` with
`wallet: google-wallet`:

```yaml
opencred:
  walletCertificates:
    - wallet: google-wallet
      id: google-2026
      type: ES256
      displayName: Google Wallet reader 2026-Q2
      privateKeyPem: |
        -----BEGIN PRIVATE KEY-----
        ...your EC P-256 key...
        -----END PRIVATE KEY-----
      publicKeyPem: |
        -----BEGIN PUBLIC KEY-----
        ...matching public key...
        -----END PUBLIC KEY-----
      certificatePem: |
        -----BEGIN CERTIFICATE-----
        ...your registered certificate...
        -----END CERTIFICATE-----
      google:
        rpMetadataBytes: <base64url-encoded RP metadata from Google>
```

Only one `wallet: google-wallet` entry is used at a time (the first
matching entry in config array order). Multiple entries are allowed
for rotation — add the new entry, verify it works, then remove the
old one.

Google Wallet requires relying-party branding metadata in every
authorization request. Provide the Base64URL-encoded CBOR value Google
supplies under `google.rpMetadataBytes`; OpenCred emits it verbatim as
`client_metadata.gw_rp_metadata_bytes`. If `google.rpMetadataBytes` is
omitted, OpenCred logs a startup warning and sends the request without
the field; Google Wallet may reject it.

On startup OpenCred also verifies that `google.rpMetadataBytes` matches
the leaf certificate: it compares the `SHA-256` of the (Base64URL-decoded)
metadata against the value in the certificate's Google Verifier Registrar
extension `1.3.6.1.4.1.11129.10.1`. A mismatch, or a leaf certificate
that lacks the extension, produces a startup warning (it does not block
startup). Certificates issued through Google's Verifier Registrar
onboarding embed this extension.

### Request flow

Set the request's `profile` query parameter to `google-wallet`:

```
POST /workflows/{id}/exchanges/{id}/openid/client/authorization/request?profile=google-wallet
```

OpenCred responds with a `dcApiRequest` envelope containing a signed
JWT (protocol `openid4vp-v1-signed`). The JWT includes:

- `client_id` set to `x509_hash:<SHA-256 fingerprint of your cert>`
  (the `x509_hash` scheme is conveyed by this prefix; OID4VP 1.0 does
  not carry a separate `client_id_scheme` claim)
- `response_mode: "dc_api.jwt"` (encrypted response)
- `client_metadata.jwks.keys[]` with an ephemeral encryption key
- `client_metadata.gw_rp_metadata_bytes` with your registered RP
  branding metadata (when `google.rpMetadataBytes` is configured)
- `x5c` in the JWT header containing your certificate chain

The response from Google Wallet is an encrypted JWE, which OpenCred
decrypts and verifies automatically.

For backward compatibility, `profile=18013-7-Annex-D` remains
supported; it produces an unsigned (or optionally signed) Annex D
request using the generic `x509_san_dns` scheme without wallet
certificates.

### 7. Configure Exchange Protocols

Specify the exchange protocols in the `options` section:

```yaml
options:
  exchangeProtocols:
    - openid4vp
```

Advanced: You may tune which interaction methods are available for the system or
a workflow.

- The Interaction URL protocol provides a QR-and-copy interaction method
  that works with any wallet capable of navigating to an HTTPS URL. It is
  enabled by default for all workflows. (`interactEnabled`)
- The DC API protocol is enabled by default for all workflows. (`dcApiEnabled`).
  It is available for mDoc credential queries.

To change the default globally, add to the `options` section:

```yaml
options:
  interactEnabled: false
  dcApiEnabled: false
```

To override per-workflow, add `interactEnabled` to the workflow:

```yaml
workflows:
  - clientId: my-workflow
    type: native
    interactEnabled: false # Disable Interaction URL for this workflow
    dcApiEnabled: false # Disable DC API for this workflow
    # ... other config
```

#### Wallet buttons for the DC API (`dcApiButtons`)

**This is optional.** With no `dcApiButtons` configured, the DC API screen shows
one button per enabled, compatible wallet, labeled with that wallet's own name.
That is the default behavior and nothing needs to be set to get it.

Configure `dcApiButtons` when you want **one button to reach wallets that read
different credential formats**. A button requests all of its `profiles` together
in a single browser Digital Credentials API call, and each wallet answers the
request it understands:

```yaml
workflows:
  - clientId: my-workflow
    type: native
    dcApiButtons:
      - id: mdl
        label: Present your mobile ID
        profiles:
          - apple-wallet
          - google-wallet
```

Apple Wallet answers the `apple-wallet` request (an ISO 18013-7 Annex C mdoc
device request), Google Wallet answers the `google-wallet` request (a signed
OID4VP 1.0 request), and the CA DMV wallet — which reads either format — may
answer either. One button, no device or wallet detection needed.

Each entry takes:

- **`id`** (required) — unique within the workflow; `[a-zA-Z0-9_-]` only.
- **`profiles`** (required) — at least one profile. **Order is significant:** it
  is the order of the requests handed to the browser, which can determine which
  handler the operating system offers first, and which format a wallet that
  reads several will answer with.
- **`label`** and/or **`labelKey`** (at least one required) — the button text.
  `labelKey` is preferred where the text needs translating, because it resolves
  through the same `translations` mechanism as the rest of the UI (including
  per-workflow overrides); define the key under `translations` and reference it
  here. A literal `label` is the quick option. When both are given, `labelKey`
  wins wherever it resolves in the active locale, otherwise `label` is used.

When `dcApiButtons` is set, it **replaces** the derived per-wallet buttons for
that workflow, so the DC API screen shows exactly the buttons configured.

**Two profiles that use the same wire format cannot share a button.** Config
loading rejects it with, for example:

```text
dcApiButtons["mdl"]: profiles "google-wallet" and "18013-7-Annex-D" both use
DC API protocol "openid4vp-v1-signed". A button must not request the same wire
format twice — one request already reaches every wallet that reads that format.
```

This is not an arbitrary restriction. Both of those profiles produce an
identical kind of request, so sending both would ask twice for the same thing,
and it would leave the response ambiguous: a wallet's reply identifies which
request it answered only by that format identifier. Pick one.

**Prerequisites.** A button's profiles must actually be on offer for the
exchange, or they are silently skipped (and the button disappears if none
remain):

- `dcApiEnabled` must not be false for the workflow (see below).
- The query must include the `mso_mdoc` format.
- `google-wallet` and `apple-wallet` each additionally require a matching
  `walletCertificates` entry — see
  [Configure Google Wallet](#configure-google-wallet-oid4vp-10-x509_hash) and
  [Apple Wallet reader authentication](#apple-wallet-reader-authentication-annex-c)
  above. Without the certificate, the profile is not published for the exchange
  at all.

#### Ordering the connection options (`connectionOptions`)

**This is optional.** With nothing configured, OpenCred derives the connection
options a user is offered — from the enabled wallets, the profiles the exchange
offers, the interaction methods each profile supports, and what the device can
do — and shows them in a fixed built-in order. That is the default and nothing
needs to be set to get it.

Configure `connectionOptions` when a workflow needs a **deterministic order** —
for example, "offer the Digital Credentials API first, and fall back to a QR
code for the default OID4VP profile." It is an ordered list; each entry names one
connection option by its interaction `method` and, for most methods, its
`profile`:

```yaml
workflows:
  - clientId: my-workflow
    type: native
    connectionOptions:
      - method: dcapi                      # DC API all-wallets option, first
      - method: qr-and-link                # then QR-and-link…
        profile: OID4VP-combined           # …for the default OID4VP profile
```

A declaration **selects and orders** the derived options; it does not replace
them. Only the options you name are shown, in the order you name them. Everything
about each option — which wallets are behind it, its launch buttons, whether it
works on this device — stays exactly as OpenCred derives it. An option you do
**not** name is not shown.

A declared option that is not viable for the current device or exchange (say,
`dcapi` on a browser with no Digital Credentials API) is simply absent, and the
next declared option takes its place — no error, no special handling.

Each entry takes:

- **`method`** (required) — one of `dcapi`, `qr-and-link`, `qr-and-copy`,
  `chapi`. These are the picker's interaction methods, not the lower-level
  `qr`/`link`/`copy`.
- **`profile`** (required, except for `dcapi`) — the profile this option is for
  (e.g. `OID4VP-combined`, `18013-7-Annex-D`, `interact`). The `dcapi` method may
  omit it to select the all-wallets DC API option; every other method must name a
  profile.
- **`label`** / **`labelKey`** (optional) — override the option's own label.
- **`destinationLabel`** / **`destinationLabelKey`** (optional) — how this option
  is named when it is the destination of the "switch connection method" link.

Each `*Key` is preferred where it resolves in the active locale, otherwise the
literal is used — the same precedence as `dcApiButtons` labels.

**Validation.** Config loading rejects a declaration that could never match a
derived option, so a typo fails fast rather than silently removing a connection
option:

- a `profile` that is not a known profile, and
- a `method` the profile does not offer (for example, `qr-and-copy` on an OID4VP
  profile, or `qr-and-link` on the DC-API-only `18013-7-Annex-D`).

What is **not** a config error — matching the `dcApiButtons` prerequisites above
— is a coherent `method`/`profile` pair the deployment cannot serve today (the
query does not request that format, no wallet answers it, the device cannot run
the method). Those are skipped at render time, and the next declared option is
promoted.

Declaring an order is deliberately independent of whether the connection-option
*picker* (the control that lets a user browse every option) is offered: the two
are separate knobs, set and reversed independently.

#### The switch control and the picker (`connectionPickerEnabled`)

When a user is offered more than one connection option, OpenCred shows a single
persistent link beneath the wallet interaction. `connectionPickerEnabled`
(**optional, defaults to `true`**) selects what that one control does:

- **`true`** — the link reads "other ways to connect" and opens a **picker
  modal** listing every option with its description and a marker on the current
  one. This is the default and matches the prior behaviour.
- **`false`** — the link **switches directly** to the next option, cycling
  through the declared order and wrapping, so every option is reachable from
  every other. It is labelled by its destination — "Scan a QR code instead",
  "Open a wallet app instead" — from the per-option `destinationLabel` /
  `destinationLabelKey` override, else a per-method default. With only one viable
  option it has nowhere to go and does not render.

The link is persistent — present before any error. It does **not** replace or
affect the error-recovery "try another way" fallback, which is a separate path.

This knob is independent of `connectionOptions`: a workflow may declare an order
and still show the picker, or hide the picker without declaring any order.
Neither implies the other. The declared order (or, with nothing declared, the
derived order) is what the switch control cycles through.

Like the other workflow options it inherits via `configFrom`, and it can be set
globally under `options` or overridden per workflow:

```yaml
options:
  connectionPickerEnabled: false # suppress the picker for every workflow
workflows:
  - clientId: my-workflow
    type: native
    connectionPickerEnabled: true # …but re-enable it for this one
```

#### Promoting wallets in the install invitation (`promotedWallets`)

The block at the bottom of the exchange page — the "install invitation" —
invites a user without a wallet to install one, showing a row per wallet with
its **product name** and app-store badges (filtered to the current platform).

**This is optional.** With nothing set, the invitation promotes what it always
has: every enabled wallet that has a storefront for the user's platform.
`promotedWallets` turns it from an explanation into a **promotion of a chosen
subset** — only the listed wallet identifiers are shown:

```yaml
workflows:
  - clientId: my-workflow
    type: native
    promotedWallets: [cadmv-ios, cadmv-android] # promote only the CA DMV wallet
```

Promotion is a separate question from enablement. A workflow may **enable** a
wallet that ships preinstalled on the user's device without wanting to
**advertise** it, so `promotedWallets` is its own list — neither the enabled
`wallets` set nor a registry flag. A listed identifier still contributes a row
only where it has a storefront for the current platform, so naming a wallet with
no store presence there is a harmless no-op.

To suppress the explanatory sentence above the rows while keeping the wallet
promotion, blank its translation key — the copy renders only when non-empty:

```yaml
    translations:
      en:
        appInstallExplain: ""
```

Like the other workflow options, `promotedWallets` inherits via `configFrom`.

### 8. Run OpenCred

```sh
npm run start
```

Congratulations, you now have a locally running OpenCred deployed ready to
receive `VerifiedEmailCredential` Verifiable Credentials!

### 9. Verify the Server

Verify that the server is running and there are no errors.

## Summary

By following these steps, you have configured a workflow in OpenCred that uses a
native exchange type. This workflow allows external relying parties (applications
that connect to OpenCred via OpenID Connect) to request and verify the
`VerifiedEmailCredential` from users securely through their digital wallet.
