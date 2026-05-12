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
certificate in the `pem` property under `caStore`. If not, remove the `caStore`
property and its children.

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
      cta: '#006847'
      homeLink: https://example.com
    translations:
      en:
        copyright: '© 2026 Example'
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
`wallets`, `oidc`, `callback`, `translations`, `trustedCredentialIssuers`,
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
signs every outgoing Annex C request with *all* matching entries in
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
supported; it produces the same DeviceRequest shape but *without*
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
```

Only one `wallet: google-wallet` entry is used at a time (the first
matching entry in config array order). Multiple entries are allowed
for rotation — add the new entry, verify it works, then remove the
old one.

### Request flow

Set the request's `profile` query parameter to `google-wallet`:

```
POST /workflows/{id}/exchanges/{id}/openid/client/authorization/request?profile=google-wallet
```

OpenCred responds with a `dcApiRequest` envelope containing a signed
JWT (protocol `openid4vp-v1-signed`). The JWT includes:

- `client_id` set to `x509_hash:<SHA-256 fingerprint of your cert>`
- `client_id_scheme: "x509_hash"`
- `response_mode: "dc_api.jwt"` (encrypted response)
- `client_metadata.jwks.keys[]` with an ephemeral encryption key
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
