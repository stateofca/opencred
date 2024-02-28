# OpenCred: The Open Credentials Platform

OpenCred is an open source credential verification platform that allows relying
party services to request claims about users with a simple API or an OpenID
Connect-style redirection workflow where the claims are verified via a user
presenting them within a credential that meets certain requirements.

An OID4VP workflow is embedded within a OIDC authentication workflow. This app
is responsible for the inner OID4VP workflow. It returns an OIDC ID token to
the relying party service or an error.

```mermaid
sequenceDiagram
    participant RP as RelyingParty
    actor User as User
    participant OpenCred as OpenCred
    participant Exchanger as Exchanger
    participant Wallet as Wallet
    note over User: Views unauthenticated webpage
    RP->>OpenCred: 1. Auth request w/client_id
    OpenCred->>Exchanger: 2. Generate OID4VP presentation request
    Exchanger->>OpenCred: 3. Success response
    OpenCred->>User: 4. Present URL & QR Code
    User-->>Wallet: 5. Scan QR Code from wallet app
    note over Wallet: Display request & credential(s)
    Wallet->>Exchanger: 6. Post Verifiable Presentation
    Exchanger->>Wallet: 7. Success response
    Wallet->>OpenCred: 8. User redirected to OpenCred
    OpenCred->>Exchanger: 9. Request exchange result
    Exchanger->>OpenCred: 10. Verified presentation w/credential
    OpenCred->>RP: 11. Redirect w/Code
    RP->>OpenCred: 12. Exchange code for id_token
    OpenCred->>RP: 13. id_token response
    RP->>User: 14. Display authenticated webpage
    note over User: Views authenticated webpage
```

# Architecture

This app uses a node express server and a Vue 3 app client application. It
doesn't yet support hot-reloading for UI component or server changes. To see
changes, you must stop the server, and restart the server, with `npm run start`.

## Usage

### Configuration

The app is configured via a YAML file. See
[configs/config.example.yaml](configs/config.example.yaml) for an example.

Copy the example to the config location `cp configs/config.example.yaml
/etc/bedrock-config/combined.yaml` and edit the file. Configure the details of
your relying party.

#### Configure with an Environment Variable
If an `OPENCRED_CONFIG` environment variable is set, the config specified in
the environment variable will supersede any file based configuration. The
environment variable must be a Base64 encoded string based on a YAML config
file. The environment variable may be set with the following command:
```
export OPENCRED_CONFIG=$(cat config.yaml | base64)
```

#### Configuring a Native workflow

Update the `relyingParties` section of the config file to include a relying
party with a workflow of type `native`. The `native` workflow type is used to
implement a VC-API exchange on this instance of OpenCred. This results in a QR
code being displayed to the user or returned through the initiate exchange API
endpoint that can be scanned by a wallet app. The wallet app will then present
the user with a list of credentials that can be used to satisfy the request.

#### Configuring did:web endpoint
You can use OpenCred as a did:web endpoint by configuring the `didWeb` section
of the config file. The following would result in a DID document being published
for the DID `did:web:example.com`. The document would be available from OpenCred
at `/.well-known/did.json`. If domain linkage is supported, you can find that
document at `/.well-known/did-configuration.json`.

```yaml
didWeb:
  mainEnabled: true
  linkageEnabled: true
  mainDocument: >
    {
      "id": "did:web:example.com",
      "@context": [
        "https://www.w3.org/ns/did/v1",
        {
          "@base": "did:web:example.com"
        }
      ],
      "service": [
        {
          "id": "#linkeddomains",
          "type": "LinkedDomains",
          "serviceEndpoint": {
            "origins": [
              "https://example.com"
            ]
          }
        },
        {
          "id": "#hub",
          "type": "IdentityHub",
          "serviceEndpoint": {
            "instances": [
              "https://hub.did.msidentity.com/v1.0/test-instance-id"
            ]
          }
        }
      ],
      "verificationMethod": [
        {
          "id": "test-signing-key",
          "controller": "did:web:example.com",
          "type": "EcdsaSecp256k1VerificationKey2019",
          "publicKeyJwk": {
            "crv": "secp256k1",
            "kty": "EC",
            "x": "test-x",
            "y": "test-y"
          }
        }
      ],
      "authentication": [
        "test-signing-key"
      ],
      "assertionMethod": [
        "test-signing-key"
      ]
    }
  linkageDocument: >
    {
      "@context": "https://identity.foundation/.well-known/did-configuration/v1",
      "linked_dids": ["eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDprZXk6ejZNa29USHNnTk5yYnk4SnpDTlExaVJMeVc1UVE2UjhYdXU2QUE4aWdHck1WUFVNI3o2TWtvVEhzZ05OcmJ5OEp6Q05RMWlSTHlXNVFRNlI4WHV1NkFBOGlnR3JNVlBVTSJ9.eyJleHAiOjE3NjQ4NzkxMzksImlzcyI6ImRpZDprZXk6ejZNa29USHNnTk5yYnk4SnpDTlExaVJMeVc1UVE2UjhYdXU2QUE4aWdHck1WUFVNIiwibmJmIjoxNjA3MTEyNzM5LCJzdWIiOiJkaWQ6a2V5Ono2TWtvVEhzZ05OcmJ5OEp6Q05RMWlSTHlXNVFRNlI4WHV1NkFBOGlnR3JNVlBVTSIsInZjIjp7IkBjb250ZXh0IjpbImh0dHBzOi8vd3d3LnczLm9yZy8yMDE4L2NyZWRlbnRpYWxzL3YxIiwiaHR0cHM6Ly9pZGVudGl0eS5mb3VuZGF0aW9uLy53ZWxsLWtub3duL2RpZC1jb25maWd1cmF0aW9uL3YxIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7ImlkIjoiZGlkOmtleTp6Nk1rb1RIc2dOTnJieThKekNOUTFpUkx5VzVRUTZSOFh1dTZBQThpZ0dyTVZQVU0iLCJvcmlnaW4iOiJpZGVudGl0eS5mb3VuZGF0aW9uIn0sImV4cGlyYXRpb25EYXRlIjoiMjAyNS0xMi0wNFQxNDoxMjoxOS0wNjowMCIsImlzc3VhbmNlRGF0ZSI6IjIwMjAtMTItMDRUMTQ6MTI6MTktMDY6MDAiLCJpc3N1ZXIiOiJkaWQ6a2V5Ono2TWtvVEhzZ05OcmJ5OEp6Q05RMWlSTHlXNVFRNlI4WHV1NkFBOGlnR3JNVlBVTSIsInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJEb21haW5MaW5rYWdlQ3JlZGVudGlhbCJdfX0.aUFNReA4R5rcX_oYm3sPXqWtso_gjPHnWZsB6pWcGv6m3K8-4JIAvFov3ZTM8HxPOrOL17Qf4vBFdY9oK0HeCQ"]
    }
```

### Configuring Signing Key

You must configure a signing key by entering key information in the
`signingKeys` section of the config, and the public keys will be published in
the `./well-known/jwks.json` endpoint for keys with the `id_token` purpose as
well as in the `.well-known/did.json` endpoint for keys with the
`authorization_request` purpose.

Supported key types for JWT signing include:

JWT alg `ES256`: generate a seed with `npm run generate:prime256v1`.

```yaml
signingKeys:
  - type: ES256
    id: 91705ba8b54357e00953b2d5cc2d805c25f86bbec4777ea4f0dc883dd84b4803
    privateKeyPem: |
      -----BEGIN PRIVATE KEY-----
      MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgdU1KX0SdMjy4AzVm
      5awy7B3tHz0y+mckq/x2V8fWwrmhRANCAARkJ4rsoMcdayGPTcAbgLfKRdqwN57I
      n9CRsED9Yno+oC4R7xz6xXpT2CQAkioPDmou1DYYU+oMaV9lCjvw9vqs
      -----END PRIVATE KEY-----
    publicKeyPem: |
      -----BEGIN PUBLIC KEY-----
      MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEZCeK7KDHHWshj03AG4C3ykXasDee
      yJ/QkbBA/WJ6PqAuEe8c+sV6U9gkAJIqDw5qLtQ2GFPqDGlfZQo78Pb6rA==
      -----END PUBLIC KEY-----
    purpose:
      - id_token
      - authorization_request
```

#### Configuring id_token claims for OIDC
Within your relying party configuration, you may configure claims that will be
extracted from a credential and included in the id_token result of an Open ID
Connect login flow. The following example will extract the `email` claim from a
credential that is presented by the user. The `email` claim will be included in
the id_token that is returned to the relying party.

```yaml
relyingParties:
  - clientId: example
    clientSecret: example
    redirectUri: http://localhost:8080/oidc/callback
    workflow:
      ...
    claims:
      - name: email
        path: userEmail
```

This configuration will place an `email` claim in the JWT, and the value of that
claim will be drawn from `credentialSubject.userEmail` path in the credential
that is verified to match the workflow requirements, if successfully presented.
In the workflow, you can use the method appropriate to the workflow type to
specify which Verifiable Credential type, context, and/or issuers you will
accept. This enables the specification of a plaintext `path` relative to
`credentialSubject` to source the claim value from.

### Configuring Exchange UX Methods

OpenCred supports two methods for initiating an exchange with a wallet app,
Credential Handler API ([CHAPI](https://chapi.io/)), and OpenID for Verifiable
Presentations([OID4VP](https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-wg-draft.html)).
Implementers may choose which of these protocols are supported by configuring
the `options.exchangeProtocols` list in the config file. The order of the
protocols controls the order in which they are offered to the user.

An `openid4vp-link` option is also available but not enabled by default, which
will launch a wallet registered to handle a `openid4vp://` on the same device as
the browser. These links may not be supported on all devices or browsers and
result in a failure with no option for user recovery if a wallet that handles
the protocol was not previously installed on the device.

```yaml
options:
  exchangeProtocols:
    - chapi-button
    - openid4vp-link
    - openid4vp-qr
```

If this section is omitted, both protocols (`openid4vp-qr` and `chapi-button`)
will be offered, with an OID4VP QR code offered to the user first.

### Run via node

Prerequisites:

* Node v20
* MongoDB v5

Install dependencies, compile the UI, and run the server:

```sh
$ npm i
$ npm run build
$ npm run start
```

### Optional Remote Tunnel Setup

In order to interact with a wallet or resolve `did:web` identifiers remotely, it
will be necessary to run the server over HTTPS from your local computer. You can
use [localtunnel](https://localtunnel.github.io/www/) to set up a tunnel to your
local server.

First, you must install localtunnel globally.

```sh
npm i -g localtunnel
```

And then run the tunnel

```sh
npm run tunnel
```

The above command will output the domain of your remote tunnel URL. You will
need to access that URL once to finish setting up the tunnel using the
instructions on that page.

Set your domain in the `config.yaml` with the above URL: `domain: "https://evil-cows-return.loca.lt"`

Then, you can run the server with the following:

```sh
npm run start
```

### Run via Docker

You can build and run the server via Docker mounting your local configuration
file with the following commands. `$PWD` substitution is the expected format for
current working directory unix/bash/zsh, Substitute your actual project root
path for other systems.

```sh
$ docker build . -t opencred-platform
$ docker run -d -p 22443:22443 -v $PWD/configs:/etc/app-config opencred-platform
$ curl https://localhost:22443/health/live
```

## Integrating with OpenCred

### Open ID Connect Login

If you configure an `id_token` signing key, you may use the service as an IDP
that extracts claims from a presented credential into an id_token. There is an
`openid-configuration` endpoint at `/.well-known/openid-configuration` with
detailed information about the algorithm and protocol support that the server
has. It references a JWKS (keyset) endpoint at `/.well-known/jwks.json` that
contains the signing key used to sign an id_token. Dynamic registration is not
supported, so you must configure `clientId` and `clientSecret` in the relying
party configuration manually, along with the credential exchange workflow that
you want to use for this client.

The OIDC workflow follows this process:

* Relying party directs a user's browser to the `/login` endpoint with
  appropriate query parameters `client_id`, `redirect_uri`, `response_type`,
  `scope`, and `state`.
* The user is presented a login page with a QR code that can be scanned by a
  wallet app for wallets on a different device (using
  [OID4VP](https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-wg-draft.html))
  or a wallet initiation button for a wallet on the same device (using
  [CHAPI](https://chapi.io/)).
* The user scans their wallet app and selects a credential to present to the
  relying party. The wallet posts a signed presentation to OpenCred, and
  OpenCred verifies it, and updates the state of the exchange with the
  information.
* The user is redirected back to the relying party with a code that can be
  exchanged for an id_token.
* The relying party exchanges the code for an id_token, which contains claims
  extracted from the credential based on the relying party's configuration.
* The relying party now can the information, such as a user identifier, to look
  up user data and authenticate the user or augment a user's profile.

Notes:
* `ES256` is the only supported signing algorithm for id_tokens to date.
* `PKCE` not yet supported.
* There is no `userinfo` endpoint, the app only supports an `id_token` result.

### HTTP API Integration

OpenCred can also facilitate gathering a user's credential(s) and presenting
them to a relying party via a HTTP API. This is useful for integrating with a
relying party that does not support OIDC. The HTTP API is documented in the
[OpenAPI](https://swagger.io/specification/) format. You can view the API
documentation in a Swagger UI at the `/api-docs` endpoint when the application
is running.

The HTTP API workflow follows this process:
* Establish configuration for a relying party with `clientId`, `clientSecret`,
  and a workflow.
* Initiate an exchange for your chosen workflow with `POST
  /workflows/{workflowId}/exchanges`. Authenticate this request using HTTP Basic
  Auth using your client ID and client secret.
* The response will contain an `OID4VP` URI and a `QR` code as a Data URI that
  you can present to your user to scan with a wallet app as well as a `vcapi`
  value that you can use to initiate a CHAPI wallet flow. It contains an
  `echangeId` that will be used to check status and an `accessToken` that is a
  short lived access token that allows you to authenticate the status check
  request.
* The user activates their wallet, for example by scanning the QR code that you
  present to them in your application, and presents a credential.
* Check the status of the exchange with `GET
  /workflows/{workflowId}/exchanges/{exchangeId}`. Authenticate this request
  with a Bearer token using `Authorization: Bearer {accessToken}` with the
  `accessToken` from the exchange initiation. Or you may continue to use the
  Basic method from the first request. The accessToken is short lived and will
  expire after a 15 minutes and may be made available to a browser client,
  whereas the `clientId` should only be held server-side.
* The response will contain an `exchange` object with a `state` that is either
  `pending`, `complete`, or `invalid` with additional results.

## Testing

### Load Testing

Load testing can be performed using [artillery](https://www.artillery.io/docs).
To install artillery globally via `npm`:

```
npm install -g artillery@latest
```

Ensure that there is a relyingParties configuration in `config.yaml` for a
relying party with `clientId: load-test` matching the configuration for that
client found in `configs/config.example.yaml`. Load testing requires on this
configuration remaining congruent with hardcoded fixtures and credentials in
the load tests.

Run the load testing script:

```
npm run test:load
```

To run the load testing script against the QA environment:

With:
- `QA_BASIC_AUTH` variable in a `.env` file which is the base64url encoding of `client_id:client_secret`.
- `QA_BASE_URL` variable in a `.env` file which is the target base url.

```
npm run test:load:qa
```

## License

[BSD-3-Clause](./LICENSE)
