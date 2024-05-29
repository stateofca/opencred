# How to Use OpenCred as an OIDC Identity Provider

## Introduction

In this guide, we will configure OpenCred to function as an OpenID Connect
(OIDC) Identity Provider (IdP). This setup will allow a relying party to
authenticate users using Verifiable Credentials (VCs) verified by OpenCred.

## Prerequisites

Ensure you have:

- A digital wallet capable of completing OID4VP exchanges
- A `VerifiedEmailCredential` to be presented during authentication
- A locally running OpenCred deployment
[(see tutorial)](./00-configure-relying-party.md)
  - For this tutorial the localtunnel URL will be `https://blue-deer-lead.loca.lt`

## Basic Steps

### 1. Create a new OIDC Relying Party Application

In your favourite OIDC authentication provider, createa a new application. For
this example we will be using Auth0. These instructions will need to be adjusted
for different providers.

1. In the Auth0 dashboard navigate to "Create Application"

    - `Applications > Applications > Create Application`

2. Enter a name for the new application and select "Regular Web Applications"

3. Add the redirect URI for your application into the "Allowed Callback URLs"
field

4. Save the application

### 2. Create a new OIDC Enterprise Connection

1. In the Auth0 dashboard create a new enterprise connection

    - `Authentication > Enterprise > OpenID Connect > Create Connection`

2. Enter a connection name

3. Enter the issuer URL of your localtunnel
`https://blue-deer-lead.loca.lt/.well-known/openid-configuration.json`

4. Enter the Client ID from the OpenCred relying party configuration
`example-client`

5. Copy the Callback URL and enter it in the OpenCred config in the
`redirectURI` field of the relying party.

**Note: THERE IS A BUG IN AUTH0 DASHBOARD.**

6. Open up the network tab, attempt to create the connection (will fail) and
copy the failed HTTP request as cURL. On the command line paste the cURL and
edit the `--data-raw` `options` to include
`"jwks_uri": "https://blue-deer-lead.loca.lt/.well-known/jwks.json",
"authorization_endpoint": "https://blue-deer-lead.loca.lt/authorize",
"issuer": "https://blue-deer-lead.loca.lt"`.

7. Once created, open the new connection and edit some of the details:
    - Set "Type" to "back channel".
    - Set "Client Secret" to the `clientSecret` from OpenCred config.
    - Set "scopes" to `openid`.

8. Navigate to the "Login Experience" tab and enable the "display connection as
button" and save.

9. Navigate to the applications tab and enable the application created in step 1

### 3. Configure your desired OAuth2 client library

From the details in the application you created in step 1 you will find all of
the details required to configure your application for authentication using
OAuth 2.0 Authorization Flow using your favourite OpenID client library.

## Summary

By following these steps, you can use OpenCred as an OIDC Identity Provider to
authenticate users with Verifiable Credentials. Note that you may need to adjust
the instructions slightly for different authentication service providers.