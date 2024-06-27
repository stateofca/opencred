![OpenCred Logo](./docs/OpenCred_Final.png)

# OpenCred: The Open Credentials Platform

OpenCred is a system designed to make it easy for organizations (verifiers) to
check credentials from individuals (holders), with their consent, in a secure
and verifiable way.

In other words, OpenCred is like a digital verification checkpoint where
organizations can ask for proof of certain information, like a driver's license,
and an individual can decide if they want to provide that information from their
digital wallet.

![image](https://github.com/stateofca/opencred/assets/108611/ace09a1c-a409-4371-81cf-ea578a2fea1e)

## Features

OpenCred supports the following list of features:

* Docker-based deployment to popular on-premise, hybrid, and cloud environments
  such as Amazon Web Services, Google Cloud Platform, and Microsoft Azure.
* Horizontal scaling to support tens of millions of verifications per day.
* Internationalization support to support multiple languages.
* Support for the W3C Verifiable Credentials Data Model and W3C Decentralized
  Identifiers.
* Support for workflows as an OpenID Connect Identity Provider or using an HTTP
  API for non-OpenID systems.
* Open digital wallet selection support through the Credential Handler API
  (CHAPI)
* Presentation protocol support for Verifiable Credential Exchanges API (VC API)
  and OpenID for Verifiable Presentation (OID4VP).
* Native/local verifier support that is not dependent on any external services.
* Remote/external verifier support using either the Verifiable Credential
  Verification API (VC API) or Microsoft Entra
* Storage of historical DID Documents to enable auditing (coming soon)

## Usage

### Configuration

The app is configured via a YAML file. See
[configs/config.example.yaml](configs/config.example.yaml) for an example.

Copy the example to the config location `cp configs/config.example.yaml
/etc/bedrock-config/combined.yaml` and edit the file. Configure the details of
your relying party.

#### Configure with an Environment Variable
If a `BEDROCK_CONFIG` environment variable is set, the config specified in
the environment variable will supersede any file based configuration. The
environment variable must be a Base64 encoded string based on a YAML config
file. The environment variable may be set with the following command:
```
export BEDROCK_CONFIG=$(cat combined.yaml | base64)
```

#### Configuring a Native workflow

Update the `relyingParties` section of the config file to include a relying
party with a workflow of type `native`. The `native` workflow type is used to
implement an OID4VP or VC-API exchange on this instance of OpenCred. This results in a QR
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

#### Configuring Signing Key

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

#### Configuring Exchange Variables

It is possible to include additional variables that will be passed along with an
exchange. These can be passed through to the exchange creation process via query
parameters or as JSON body properties. It is important to note that these params
originate from the client side application and so should be treated as
"untrusted".

While configuring a relying party workflow an `untrustedVariableAllowList`
property contains a list of variables that are allowed to be passed in this
manner. There is a default `redirectPath` variable that will always be included.

```yaml
relyingParties:
  - clientId: example
    workflow:
      type: native
      id: example-workflow
      untrustedVariableAllowList:
        - caseId
        - color
```

#### Configuring a Workflow Step

A workflow step configures the specifics of how a presentation is requested.
The step contains a `verifiablePresentationRequest` which uses a [VPR](https://w3c-ccg.github.io/vp-request-spec/) to create a [Presentation Exchange (PE)](https://identity.foundation/presentation-exchange/) object to be included in the request. If for whatever
reason the constraints need to be overwritten that can be accomplished using the
`constraintsOverride` property.

##### Callbacks

A step can also include a callback that will be sent an http POST request with
the `id`, `variables` and `step` of the exchange. The callback URL can
optionally be protected by oauth2 and can include headers using a customizable
variable.

```yaml
callback:
  url: http://localhost:9000/callback
  headersVariable: callbackHeaders
  oauth:
    issuer: http://example.com
    token_url: http://example.com/token
    client_secret: exampleClientSecret
    client_id: exampleClientId
    scope:
      - default
```

#### Configuring Exchange UX Methods

OpenCred supports two methods for initiating an exchange with a wallet app,
Credential Handler API ([CHAPI](https://chapi.io/)), and OpenID for Verifiable
Presentations([OID4VP](https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-wg-draft.html)).
Implementers may choose which of these protocols are supported by configuring
the `options.exchangeProtocols` list in the config file. The order of the
protocols controls the order in which they are offered to the user.

```yaml
options:
  exchangeProtocols:
    - chapi
    - openid4vp
```

If this section is omitted, both protocols (`openid4vp` and `chapi`)
will be offered, with an OID4VP QR code offered to the user first.

#### Configuring Translations

##### With Translations in Configuration

The login page has text entries stored in the translations entries of the
config. To configure the text of the login page set the following entries with
the enabled languages as the first level of `translations`:

```yaml
translations:
  en:
    translations:
      en: English
      fr: French
    translate: Translate
    qrTitle: Login with your Wallet app
    qrPageExplain: Scan the following QR Code using the Wallet app on your phone.
    qrPageExplainHelp: (<a href="https://youtube.com">How do I do it?</a>)
    qrFooter: "Note: Already on your phone with the Wallet app? Open the Wallet app, then come back and tap on the QR code above."
    qrFooterHelp: Difficulty using the Wallet app to login? revert to using password <a href="#">here</a>
    qrDisclaimer: If you don't have a Wallet app download it from the app store.
    qrClickMessage: The Wallet app must be running in the background.
    qrPageAnotherWay: Want to try another way?
    chapiPageAnotherWay: "Looking for a QR Code to scan with you wallet app instead?"
    loginCta: "Login with your credential wallet"
    loginExplain: "To login with your credential wallet, you will need to have the credential wallet app <with configurable URL to app stores> installed"
    appInstallExplain: "If you don't have a credential wallet yet, you can get one by downloading the credential wallet app <with configurable URL to app stores>"
    appCta: "Open wallet app"
    copyright: "Powered by OpenCred"
    pageTitle: "Login"
  fr:
    translations:
      en: Anglais
      fr: Français
    translate: Traduire
    qrTitle: Connectez-vous avec votre application CA DMV Wallet
    ...
```

##### With Google Translate

It is also possible to use an embedded Google Translate widget that will enable
translations without including all of the translations in the configuration. To
enable this feature include a `customTranslateScript` property (which will
override manual translations) in the config with a URL to a script that includes
a script for injecting the widget. To use the default Google Translate script
use the following config:

```yaml
customTranslateScript: https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit
```

#### Configuring Audit
You can add auditing support to OpenCred to ensure that a VP token presented in the past was valid at the time it was presented. The VP token can be one of two formats: (1) JWT or (2) Data Integrity. In order to enable this feature, use the boolean field `enableAudit` and the array field `auditFields` in the config file:

```yaml
enableAudit: true
auditFields:
  - type: text
    id: given_name
    name: First Name
    path: "$.credentialSubject.given_name"
    required: true
  - type: text
    id: family_name
    name: Last Name
    path: "$.credentialSubject.family_name"
    required: false
  - type: date
    id: birth_date
    name: Date of Birth
    path: "$.credentialSubject.birth_date"
    required: true
  - type: number
    id: height
    name: Height (cm)
    path: "$.credentialSubject.height"
    required: false
  - type: dropdown
    id: sex
    name: Sex
    path: "$.credentialSubject.sex"
    required: false
    options:
      "Male": 1
      "Female": 2
  - type: dropdown
    id: senior_citizen
    name: Are you a senior citizen?
    path: "$.credentialSubject.senior_citizen"
    required: true
    options:
      "Yes": 1
      "No": null
```

The `enableAudit` field enables support for auditing in an OpenCred deployment.
If you would also like to check for matching values in the token's credential
in a web interface, you can specify the following attributes for each
field of interest via the `auditFields` field and visit `BASE_URL/audit-vp` in the browser:
- `type` - The field type (currently, supports `text`, `number`, `date`, and `dropdown`).
- `id` - The field ID (can be anything, but must be unique among other fields).
- `name` - The field name that appears in the web interface.
- `path` - The field path in the credential (must be unique among other fields).
- `required` - Whether the admin user is required to enter a value for the field in the web interface.
- `options` - Data binding from user-friendly name to associated value for the field in the web interface. This property is used whenever a field can have one of multiple possible machine-readable values in a discrete set of options (e.g., `Male` -> `1`, `Female` -> `2`). The input for this field will be presented as a dropdown selection element. If one of the options is the absence of the field from the credential, you can represent this by binding the field to `null`. For example, here are the expectations for each selection for the field named `Are you a senior citizen?` in the sample snippet above:
  - `Yes` - There exists a field with path `$.credentialSubject.senior_citizen` containing value `1` in the credential.
  - `No` - There does **not** exist a field with path `$.credentialSubject.senior_citizen` in the credential.

If you want to test out the audit feature, follow these steps:
1. Run an instance of OpenCred using the instructions below.
2. Follow the steps in the running app to present a credential to OpenCred.
3. Run `mongosh mongodb://localhost:27017/opencred_localhost`.
4. Run `db.Exchanges.find().pretty()`.
5. Search for `vpToken`.
6. Run `cp test/fixtures/audit/vpTokenExample.json test/fixtures/audit/vpToken.json`.
7. Open `test/fixtures/audit/vpToken.json` and replace the value in the `vpToken` field with the token from an earlier step.
8. Optionally, add mapping from credential field paths to expected value.
9. Run `npm run audit-vp BASE_URL`, where `BASE_URL` is the base URL of the running app, configured as `app.server.baseUri` in the config.
10. Observe verification results.

### Run via node

This app uses a `@bedrock/express` server and a Vue 3 UI client application. It
supports hot reloading for UI changes during development.

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

Set your `app.server.baseUri` in your `combined.yaml` with the above URL: `baseUri: "https://evil-cows-return.loca.lt"`

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

OpenCred makes it easy to request a credential from a user and return
information to a connected application or "relying party." This can either be
done with OpenID Connect or calling OpenCred's HTTP API for more precise
control.

* Choose OpenID Connect if you can redirect the user in a browser to OpenCred
  and want to use a standard protocol for authentication that may already be
  supported in your environment or easy to integrate using a well-known library.
  This method enables you to obtain an `id_token` that contains claims extracted
  from the credential that the user presents.
* Choose the HTTP API if redirecting the user in a browser is impractical, you
  want to present the credential request to the user via your own interface
  (displaying a QR code and enabling the user to launch a wallet app for
  same-device wallet use), or you want to receive the Verifiable Presentation
  and Verifiable Credential data in their original form.


### Open ID Connect Login

You can enable users to sign into a relying party application with a Verifiable
Credential using OpenCred as an identity provider connected over OAuth 2.0 /
OpenID Connect. OpenCred returns a signed `id_token` that contains specific claims

 There is an
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
* You must configure a signing key with the `id_token` purpose in the config to
  use this method of integration. The public key will be published in the
  `/.well-known/jwks.json` endpoint.
* You must configure `claims` of your relyingParty to specify which claims you
  want to extract from the credential and include in the `id_token` result.
* `ES256` is the only supported signing algorithm for id_tokens to date.
* `PKCE` not yet supported.
* There is no `userinfo` endpoint, the app only supports an `id_token` result.

### HTTP API Integration

Each time a relying party application requests a credential from a user,
OpenCred manages a credential "exchange" that lets the user present a Verifiable
Presentation containing a Verifiable Credential, which is verified and made
available to the relying party. The HTTP API is documented in the
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
  `exchangeId` that will be used to check status and an `accessToken` that is a
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
  `pending`, `active`, `complete`, or `invalid` with additional results.

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
