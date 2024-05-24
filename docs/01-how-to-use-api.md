# How to Use the OpenCred API

## Introduction

In this guide, we will walk you through using the OpenCred API to create and 
manage credential exchanges. All interactions can be performed through the 
API Docs available at http://localhost:22080/api-docs or through any means of
sending HTTP requests.

## Prerequisites

Ensure you have:

- A digital wallet capable of completing OID4VP exchanges
- A `VerifiedEmailCredential` in that wallet
- A locally running OpenCred deployment
[(see tutorial)](./00-configure-relying-party.md)

## Basic Steps

### 1. Create a New Exchange

To create a new exchange, use the `/workflows/:workflowId/exchange` POST 
endpoint. This requires basic authentication, where the `clientId` is the 
username and the `clientSecret` is the password.

**Endpoint**: `/workflows/:workflowId/exchanges`

**Method**: POST

**Authentication**: Basic Auth (username: `clientId`, password: `clientSecret`)

**Request Example**:
```http
POST /workflows/example-workflow/exchanges
Authorization: Basic base64(clientId:clientSecret)
```

**Response**:
The response will include details of the exchange, including a QR code 
(as a base64 data URL image) and an OID4VP URI.

**Example Response**:

```json
{
  "id": "z1A8a3zq61Cb6daoTrVqnwj6V",
  "vcapi": "https://five-parents-search.loca.lt/workflows/z1A32xJZGqBe...",
  "OID4VP": "openid4vp://?client_id=did%3Aweb%3Afive-parents-search.loc...",
  "accessToken": "z1A12gsySNHcGYhQUpRPqEtKt",
  "oidc": {
    "code": null,
    "state": ""
  },
  "workflowId": "z1A32xJZGqBeAEcMq56avmw2L",
  "QR": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARQAAAEUCAYAA..."
}
```

### 2. Provide the QR Code or OID4VP Link to the Wallet

From the response in step 1, extract the QR code or OID4VP URI and provide 
it to the wallet. The user will use their wallet app to scan the QR code or 
follow the OID4VP URI to present the requested credential.

**Example QR Code (base64 data URL)**:
```json
{
  "QR": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARQAAAEUCAYAA..."
}
```

**Example OID4VP Link**:
```json
{
  "OID4VP": "openid4vp://?client_id=did%3Aweb%3Afive-parents-search.loc..."
}
```

### 3. Present the Requested Credential

The user needs to use their wallet app to present the requested credential 
to the exchange. This process is handled by the wallet app, which will 
interact with the OpenCred server using the provided QR code or OID4VP URI.

### 4. Query the Status of the Exchange

To check the status of the exchange, use the `/workflows/:workflowId/exchanges/
:exchangeId` GET endpoint. This requires an access token obtained from the 
response in step 1, used as a Bearer auth header.

**Endpoint**: `/workflows/:workflowId/exchanges/:exchangeId`

**Method**: GET

**Authentication**: Bearer Token (access token from the response in step 1)

**Request Example**:
```http
GET /workflows/example-workflow/exchanges/example-exchange-id
Authorization: Bearer example-access-token
```

**Response**:
The response will include the state of the exchange, which can be `pending`, 
`active`, `complete`, or `invalid`. The verified VeriablePresentation will be
found in the `exchange.variables.results.default.verifiablePresentation` where
`default` is the name of the step being completed.

**Example Response**:
```json
{
  "exchange": {
    "id": "z1A2Rj9e5eJ3c9jXBJKyvaotP",
    "workflowId": "z1A32xJZGqBeAEcMq56avmw2L",
    "sequence": 1,
    "ttl": 900,
    "state": "complete",
    "variables": {
      "results": {
        "default": {
          "verifiablePresentation": {
            "@context": [
              "https://www.w3.org/2018/credentials/v1"
            ],
            "type": [
              "VerifiablePresentation"
            ],
            "verifiableCredential": [
              {
                "@context": [
                  "https://www.w3.org/2018/credentials/v1",
                  "https://www.example.com/email-credential/v1",
                ],
                "id": "urn:uuid:cc35d4fc-ae6d-4029-b385-1ac0bed12b9b",
                "type": [
                  "VerifiableCredential",
                  "VerifiedEmailCredential"
                ],
                "credentialSubject": {
                  "id": "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6I...",
                  "email": "test@example.com"
                },
                "issuer": "did:example:c276e12ec21ebfeb1f712ebc6f1",
                "issuanceDate": "2024-05-24T21:51:36Z",
                "expirationDate": "2024-05-24T22:51:36Z"
              }
            ]
          },
          "vpToken": "eyJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDpqd2s6ZXlKamNuWWl..."
        }
      },
      "authorizationRequest": {
        "response_type": "vp_token",
        "response_mode": "direct_post",
        "presentation_definition": {
          "id": "9ee51379-8419-4a1c-bc09-42dca1098b16",
          "input_descriptors": [
            {
              "id": "6509f93c-135f-48dc-802c-161c051c3a73",
              "constraints": {
                "fields": [
                  {
                    "path": [
                      "$.vc.type"
                    ],
                    "filter": {
                      "type": "string",
                      "pattern": "VerifiedEmailCredential"
                    }
                  }
                ]
              },
              "purpose": "Please present your Verified Email Credential.",
              "format": {
                "jwt_vc_json": {
                  "alg": [
                    "ES256"
                  ]
                }
              }
            }
          ]
        },
        "client_id": "did:web:twenty-spoons-dance.loca.lt",
        "client_id_scheme": "did",
        "nonce": "z19xjtDAQsD3YMJGUJeSGxvfd",
        "response_uri": "https://twenty-spoons-dance.loca.lt/workflows/z1A3...",
        "state": "z1A4RzouPyewF4cQ5oFF8Qmz8",
        "client_metadata": {
          "client_name": "OpenCred Verifier",
          "subject_syntax_types_supported": [
            "did:jwk"
          ],
          "vp_formats": {
            "jwt_vc": {
              "alg": [
                "ES256"
              ]
            }
          }
        }
      }
    },
    "step": "default",
    "challenge": "z19xjtDAQsD3YMJGUJeSGxvfd",
    "accessToken": "z19wFk3ZWr8BsehgPpbuvL7fS",
    "createdAt": "2024-05-24T21:52:12.280Z",
    "recordExpiresAt": "2024-05-25T22:07:12.280Z",
    "oidc": {
      "code": "z19u3AnwotSuRXko8wNKaW6vD",
      "state": ""
    },
    "updatedAt": "2024-05-24T21:52:43.612Z"
  }
}
```

## Summary

By following these steps, you can use the OpenCred API to create and manage 
credential exchanges. Ensure you refer to the API Docs at http://localhost:22080
/api-docs for detailed information and examples for each endpoint.