# OpenCred: The Open Credentials Platform

OpenCred is an open source credential verification platform that allows relying party 
services to request claims about users over an OpenID Connect-style redirection
workflow where the claims are verified via a user presenting them within a 
credential that meets certain requirements.

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
    RP->>OpenCred: Auth request w/client_id
    OpenCred->>Exchanger: Generate OID4VP presentation request
    Exchanger->>OpenCred: Success response
    OpenCred->>User: Present URL & QR Code
    User-->>Wallet: Scan QR Code from wallet app
    note over Wallet: Display request & credential(s)
    Wallet->>Exchanger: Post Verifiable Presentation
    Exchanger->>Wallet: Success response
    Wallet->>OpenCred: User redirected to OpenCred
    OpenCred->>Exchanger: Request exchange result
    Exchanger->>OpenCred: Verified presentation w/credential
    OpenCred->>RP: Redirect w/Code
    RP->>OpenCred: Exchange code for id_token
    OpenCred->>RP: id_token response
    RP->>User: Display authenticated webpage
    note over User: Views authenticated webpage
```

# Architecture

This app uses a node express server to render a Vue 3 app first in SSR mode on the server and then hydrated on the client. The Vue app is compiled with Vite into server and client-side entry points. The methodology is based on this [example](https://github.com/vitejs/vite-plugin-vue/tree/main/playground/ssr-vue).

It doesn't yet support hot-reloading for UI component changes integrated with the express app. (Example [isProd](https://github.com/vitejs/vite-plugin-vue/blob/main/playground/ssr-vue/server.js#L36) checks could be added to set up a vite server). To see changes, you must stop the server, rebuild the UI, and restart the server, as with `npm run build && npm run start`.

## Usage

### Directly via node

Node v20 is used for this project.

Install dependencies, compile the UI, and run the server:

```sh
$ npm i
$ npm run build
$ npm run start
```

### via Docker

```sh
$ docker build . -t opencred-platform
$ docker run -p 8080:8080 -d opencred-platform
$ curl http://localhost:8080/health
```

## License

BSD-3-Clause
