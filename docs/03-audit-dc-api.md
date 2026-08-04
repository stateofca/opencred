# Audit a DC API DeviceRequest

## Overview

The `audit-dc-api` CLI decodes a base64url-encoded Apple Wallet DC API
`deviceRequest` (and optional `encryptionInfo`), reports its CBOR structure,
inspects the leaf reader certificate from `readerAuthAll`, and can diff two
requests field-by-field. Use it when debugging interop issues — for example,
confirming that `readerAuthAll[i]` is a 4-element COSE_Sign1 array with a
`null` detached payload rather than a text-keyed map.

Output is structured JSON by default (machine-diffable). Pass `--pretty` for
a human-readable text report.

This tool is used to assist with debugging interop issues with wallets, but
it may be removed in the future if this is no longer needed. It is particularly
suited for comparing a working and a failing implementation, because detailed
errors aren't emitted across the DC API boundary about what request validation
failure happened.

## Invocation

From the `opencred-platform/` directory:

```shell
npm run audit-dc-api -- --device-request <base64url>
```

Optional flags:

| Flag | Description |
|------|-------------|
| `--encryption-info <base64url>` | Decode the HPKE handover `encryptionInfo` envelope alongside the device request. |
| `--compare <base64url>` | Diff this request against another base64url `deviceRequest`. Emits `{left, right, diff}`. |
| `--pretty` | Human-readable text instead of JSON. With `--compare`, prints both audits and a diff summary separated by `---`. |

Examples:

```shell
# JSON audit of a single request
npm run audit-dc-api -- --device-request eyJ2ZXJzaW9uIjoiMS4xIi...

# Include encryptionInfo from the same DC API response payload
npm run audit-dc-api -- \
  --device-request eyJ2ZXJzaW9uIjoiMS4xIi... \
  --encryption-info eyJkY2FwaSIs...

# Side-by-side diff (JSON)
npm run audit-dc-api -- \
  --device-request <opencred-b64> \
  --compare <reference-b64>

# Human-readable report
npm run audit-dc-api -- --device-request <b64> --pretty
```

## Capturing a request to audit

When OpenCred serves an apple-wallet profile exchange, the browser's DC API
call carries a JSON payload with `deviceRequest` and `encryptionInfo` fields.
Each value is base64url-encoded CBOR. In Chrome DevTools, open the Network tab,
find the DC API request, inspect the request body, and copy the `deviceRequest`
string (and optionally `encryptionInfo`). Pass those strings directly to the
CLI — no files or running server required.

If the button requests several profiles at once (see `dcApiButtons` in
`00-configure-workflow.md`), the authorization request response is
`{dcApiRequests: [{profile, dcApiRequest}, ...]}` rather than a single envelope.
Pick the entry whose `profile` is the Annex C one — `apple-wallet`, `cadmv-ios`,
or `18013-7-Annex-C` — and read `dcApiRequest.data` for the `deviceRequest` and
`encryptionInfo` values. The other entries carry a different wire format and are
not what this tool audits.

Do not commit captured production requests into the repository.

## Output structure

Default output is a JSON object with `deviceRequest` (structure summary) and,
when an x5chain is present in `readerAuthAll`, a `certificates` block with
leaf cert metadata. When `--encryption-info` is supplied, an `encryptionInfo`
block is included.

Synthetic example (truncated cert metadata; signature reported as length only):

```json
{
  "deviceRequest": {
    "version": "1.1",
    "topLevelKeys": [
      "deviceRequestInfo",
      "docRequests",
      "readerAuthAll",
      "version"
    ],
    "topLevelKeysExpected": [
      "deviceRequestInfo",
      "docRequests",
      "readerAuthAll",
      "version"
    ],
    "topLevelKeysMatch": true,
    "docRequests": [
      {
        "docType": "org.iso.18013.5.1.mDL",
        "nameSpaces": {
          "org.iso.18013.5.1": {
            "given_name": false
          }
        }
      }
    ],
    "deviceRequestInfo": {
      "useCases": [
        {
          "mandatory": true,
          "documentSets": [[0]]
        }
      ]
    },
    "readerAuthAll": [
      {
        "shape": "array4",
        "protectedBstrLength": 3,
        "unprotectedHeaderKeys": [33],
        "payloadKind": "null",
        "signatureLength": 64
      }
    ]
  },
  "certificates": {
    "chainLength": 1,
    "leaf": {
      "subjectCN": "audit-cli-test",
      "issuerCN": "audit-cli-test",
      "sanDnsNames": ["reader.example.com"],
      "notBefore": "2026-05-27T00:00:00.000Z",
      "notAfter": "2027-05-27T00:00:00.000Z",
      "signatureAlgorithm": "ecdsa-with-SHA-256",
      "sha256Fingerprint": "<sha256 fingerprint>",
      "serialNumber": "<serial>",
      "keyAlgorithm": "ECDSA P-256"
    },
    "intermediates": []
  }
}
```

Key fields under `deviceRequest.readerAuthAll[i]`:

- `shape` — `array4` (correct RFC 9052 wire shape), `map` (broken
  text-keyed encoding), `array-other`, or `unknown`.
- `payloadKind` — `null` (detached payload per Annex C), `bstr-empty`,
  `bstr`, or `other`.
- `protectedBstrLength` / `signatureLength` — byte lengths of COSE bstr
  slots (raw bytes are not echoed).

With `--pretty`, the same fields appear as sectioned text (`## DeviceRequest`,
`### readerAuthAll[0]`, `### x5chain`, etc.) instead of JSON.

## Diff mode

`--compare` decodes both requests, builds an audit payload for each, and
emits a structured diff. The most important interop signal is
`diff.wireShapeDelta`, which summarizes `readerAuthAll[*].shape` per side.

Example comparing a correct `array4` request (left) against a broken `map`
shape (right):

```json
{
  "diff": {
    "wireShapeDelta": {
      "left": ["array4"],
      "right": ["map"]
    },
    "differences": [
      {
        "path": "deviceRequest.readerAuthAll[0].shape",
        "left": "array4",
        "right": "map",
        "kind": "shape"
      },
      {
        "path": "deviceRequest.readerAuthAll[0].payloadKind",
        "left": "null",
        "right": "bstr-empty",
        "kind": "shape"
      }
    ],
    "matches": [
      "deviceRequest.topLevelKeys",
      "deviceRequest.docRequests[0].docType",
      "..."
    ]
  }
}
```

Difference `kind` values: `shape`, `value`, `missing-left`, `missing-right`.
