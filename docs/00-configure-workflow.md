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
      scopes:
        - name: "openid"
          description: "Open ID Connect"
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
