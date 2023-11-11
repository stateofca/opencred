# OpenCred: The Open Credentials Platform

OpenCred is an open source credential verification platform that allows relying
party services to request claims about users over an OpenID Connect-style
redirection workflow where the claims are verified via a user presenting them
within a credential that meets certain requirements.

An OIDC4CVP workflow is embedded within a OIDC authentication workflow. This app
is responsible for the inner OIDC4CVP workflow. It returns an OIDC ID token to
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

This app uses a node express server to render a Vue 3 app first in SSR mode on
the server and then hydrated on the client. The Vue app is compiled with Vite
into server and client-side entry points. The methodology is based on this
[example](https://github.com/vitejs/vite-plugin-vue/tree/main/playground/ssr-vue).

It doesn't yet support hot-reloading for UI component changes integrated with
the express app. (Example
[isProd](https://github.com/vitejs/vite-plugin-vue/blob/main/playground/ssr-vue/server.js#L36)
checks could be added to set up a vite server). To see changes, you must stop
the server, rebuild the UI, and restart the server, as with `npm run build &&
npm run start`.

## Usage

### Configuration

The app is configured via a YAML file. See
[config/config.example.yaml](config/config.example.yaml) for an example.

Copy the example to the ignored location `cp config/config.example.yaml
config/config.yaml` and edit the file. Configure the details of your relying
party, and connection details for a VC-API exchanger endpoint

#### Configuring a Native workflow

Update the `relyingParties` section of the config file to include a relying
party with a workflow of type `native`. The `native` workflow type is used to
implement a VC-API exchange on this instance of OpenCred. This results in a QR
code being displayed to the user or returned through the initiate exchange API 
endpoint that can be scanned by a wallet app. The wallet app will then present
the user with a list of credentials that can be used to satisfy the request.

#### Configuring did:web endpoint
You can use OpenCred as a did:web endpoint by configuring the `didWeb` section
of the config file. The following would result in a DID document being
published for the did `did:web:example.com`. The document would be available
from OpenCred at `/.well-known/did.json`. 

```yaml
didWeb:
  enabled: true
domain: https://example.com
```

You may enter key information in the `signingKeys` section
of the config, and the public keys will be published at the did:web endpoint if
you include the `assertionMethod` purpose in the key configuration. If you enable signingKeys, you may also want to enable the `linkedDomain` purpose. If any keys
have the `linkedDomain` purpose, the `/.well-known/did-configuration.json` 
endpoint will be include a LinkedDomainCredential signed with the key.

Supported key types include: 

`Ed25519VerificationKey2020`: generate a seed with `npm run generate:ed25519`.

```yaml
signingKeys: 
  - type: Ed25519VerificationKey2020
    seed: z1AkD6Wv5tKQdCTFJMEmF9vDJaa4V6f44jUasJPyn6RqdFZ
    purpose: 
      - assertionMethod
      - DomainLinkageCredential
```

### Run via node

Prerequisites: 

* Node v20
* MongoDB: configure e.g. `dbConnectionUri: mongodb://localhost:27017`

Install dependencies, compile the UI, and run the server:

```sh
$ npm i
$ npm run build
$ npm run start
```

### Run via Docker

You can build and run the server via Docker mounting your local configuration
file with the following commands. `$PWD` substitution is the expected format for
current working directory unix/bash/zsh, Substitute your actual project root
path for other systems.

```sh
$ docker build . -t opencred-platform
$ docker run -d -p 8080:8080 -v $PWD/config:/etc/app-config opencred-platform
$ curl http://localhost:8080/health
```

## License

BSD-3-Clause
