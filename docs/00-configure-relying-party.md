# How to Configure OpenCred with a Relying Party Using a Native Exchange

## Introduction

In this guide, we will configure OpenCred to set up a relying party that will be
requesting a "VerifiedEmailCredential" from users. We will setup OpenCred to be
run locally using a **native** workflow.

## Prerequisites

Ensure you have:

- OpenCred cloned from [Github](https://github.com/stateofca/opencred)
- Node.js v20 or higher
- Dependencies installed (`npm install`)
- The necessary `VerifiedEmailCredential` to be presented to the relying party.

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

#### Conditional x509 enforcement

If the VC is not expected to include a x509 certicate but you wish to keep the certificate (e.g., if another relying party requires it), you can disable the requirement by adding a `enforcex5cCert: false` property to the relying party configuration.

```yaml
relyingParties:
  - clientId: exampleClient
    enforcex5cCert: false
```

This will disable the requirement for a valid x509 certificate even if `caStore` is defined for other reasons.

Important: if at any point a x509 is provided and `caStore` is defined then the certificate will be verified and a warning log emitted regardless of the `enforcex5cCert` value.

### 4. Configure the Relying Party

Remove all of the example relying parties under the `relyingParties` section and
add a new entry for your relying party with a `native` workflow. Example:

```yaml
relyingParties:
  - clientId: example-client
    clientSecret: example-secret
    redirectUri: http://localhost:8080/oidc/callback
    scopes:
      - name: "openid"
        description: "Open ID Connect"
    claims:
      - name: email
        path: credentialSubject.email
    workflow:
      type: native
      id: example-workflow
      initialStep: default
      steps:
        default:
          verifiablePresentationRequest: >
            {
              "query": {
                "type": "QueryByExample",
                "credentialQuery": {
                  "reason": "Please present your Verified Email Credential.",
                  "example": {
                    "type": [
                      "VerifiedEmailCredential"
                    ]
                  }
                }
              }
            }
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

By following these steps, you have configured OpenCred to work with a relying
party using a native exchange workflow. This setup allows the relying party to
request and verify the `VerifiedEmailCredential` from users securely through
their digital wallet.
