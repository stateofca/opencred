# Multi-profile DC API authorization requests

- Status: accepted
- Date: 2026-07-29

## Context

A workflow needs a single wallet button that reaches wallets speaking different
formats. Google Wallet reads an ISO 18013-7 Annex D / OID4VP 1.0 signed request;
Apple Wallet reads an Annex C mdoc `DeviceRequest`; the CA DMV wallet reads
either. The W3C Digital Credentials API allows one
`navigator.credentials.get()` call to carry several requests
(`digital.requests`), each wallet answering the one it understands.

Before this change, one exchange could hold the state of only one authorization
request. Every DC API profile handler writes into a single flat slot on
`exchange.variables` — `{profile, authorizationRequest, …profile-specific key
material…}` — and the middleware persisted that with `replaceOne`. Two
sequential authorization requests clobbered each other, and the response
dispatcher selected its handler from `exchange.variables.profile`, so a wallet's
response could only ever be verified against the last request issued.

## Decisions

### 1. One call carries every profile

`GET …/openid/client/authorization/request` accepts a **repeated `profile`
parameter** and returns `{dcApiRequests: [{profile, dcApiRequest}, …]}` in
requested order, plus a singular `{dcApiRequest}` when exactly one profile was
requested so existing clients are unaffected.

Chosen over having the client call the endpoint once per profile. One call means
one handler invocation and one write, which removes the lost-update race by
construction rather than by careful ordering. It also collapses N network round
trips to one inside the transient user activation that
`navigator.credentials.get()` requires, and it puts the all-or-nothing decision
on the server, where the configuration knowledge is.

A multi-profile request must contain only DC API profiles. The standard and
draft-18 profiles respond with a bare signed JAR JWT body under
`application/oauth-authz-req+jwt`, which cannot be an element of a JSON array;
`PROFILE_DC_API_PROTOCOL` is the registry of which profiles qualify.

Any profile that fails to build fails the whole call with `400` and the
per-profile errors aggregated. Serving the rest would turn a misconfiguration —
a missing wallet certificate, say — into a wallet that silently never appears,
with nothing in the response to say why.

### 2. Pending requests are stored as an array, and hydrated for handlers

All pending requests are persisted in one write as
`exchange.variables.dcApiRequests`, an array of
`{profile, protocol, requestGroupId, kid?, authorizationRequest?, material}`.

An array rather than a map keyed by profile: it preserves configured request
order (which may determine which handler the OS offers first, and which format a
wallet that reads several answers with), it makes "exactly one protocol match"
an explicit assertion rather than an implicit key overwrite, and it avoids Mongo
update-path constraints entirely — `OID4VP-1.0` and `OID4VP-HAIP-1.0` contain
dots, which are invalid in a field path.

Each entry is built **entirely from the handler's `updatedExchange.variables`** —
both the named `authorizationRequest` field and the `material` are read from that
one object, never from the handler's return shape. Generators are not required to
surface `authorizationRequest` at the top level of their result: Annex C, for
one, writes it only into its exchange variables. `material` is the remaining set
of variables a handler contributed, lifted out by deep comparison against a
snapshot taken before it ran. On response, the matched entry is **hydrated** back
into the flat shape and handed to the existing profile response handler, which
therefore needs no knowledge that multi-profile requests exist.
`extractRequestMaterial` and `hydratePendingRequest` are exact inverses and live
side by side in `dc-api-pending-requests.js` for that reason. As a backstop, the
request middleware asserts every entry, once hydrated, carries the state its
response handler needs (`hasResponseState`) before persisting, so a dropped field
fails the authorization request loudly instead of surfacing later as a wallet
response error.

The alternative — giving every handler an explicit `pendingRequest` argument and
having it return a variables delta — is cleaner in the abstract but rewrites
eight handlers whose verification paths are the parts currently proven against
real wallets. Confining resolution and hydration to one module keeps that
refactor available later as a mechanical change.

On success the handler's result is persisted with `dcApiRequests` removed. What
remains is exactly the flat shape a completed exchange has always had, so
callbacks, audit, and the success view are unaffected. On failure the pending
requests are **retained**, so a user whose Apple Wallet attempt failed can retry
with Google against the already-issued requests.

### 3. Responses are routed by DC API protocol, and colliding buttons are rejected

A response is matched to its pending request by the DC API protocol identifier,
asserting exactly one match. To keep that unambiguous, config load **rejects any
button whose profiles emit the same protocol**.

That restriction is not a limitation in practice: such a button requests the same
wire format twice, and one request already reaches every wallet that reads that
format. An `[apple-wallet, google-wallet]` button covers the CA DMV wallet
precisely because it reads either.

Protocol is the only signal available. The W3C DC API's `DigitalCredential`
exposes exactly `protocol` and `data` and carries no index or identifier for
which entry of `digital.requests` was satisfied (verified against the
specification, 2026-07-29). Richer signals cannot be read before a key is
chosen: an Annex C response is HPKE-encrypted CBOR with no DCQL query and no
`state`, and an encrypted OID4VP response hides both inside the JWE. DCQL
credential ids would not help even where visible — `buildMsoMdocCredentials`
emits `id: '0'` for every mdoc query, so they are not per-profile unique.

Rejected alternatives:

- **A profile-aware response URL.** DC API requests carry no `response_uri`; the
  wallet returns through `navigator.credentials.get()` to our own frontend.
- **A client-declared profile as the authority.** The frontend's only signal is
  the same protocol string, so it adds no information, and letting a client name
  the profile would let it steer which stored key material verifies a response
  it supplied. It is accepted as a hint that can only narrow among candidates
  already agreeing with the protocol, so it can be promoted later if the DC API
  gains a request back-reference.
- **Trial decryption.** Unnecessary given the collision ban, and it would drive
  repeated decryption attempts from attacker-influenceable input while blurring
  failure diagnostics.

The per-request `kid` already stamped on the ephemeral response-encryption key
(and already published in `client_metadata.jwks`) is lifted onto each entry as a
cross-check; a conforming wallet echoes it in the JWE protected header. It is
not load-bearing.

### 4. Observability names what it knows

A `requestGroupId` correlates the requests issued by one call with the response
that answers one of them. `presentation_response_received` stays at arrival, so
"a response arrived" remains measurable against "a response succeeded"; it
carries the response protocol and the group id, both known without resolving.
The profile that actually answered is carried by the terminal
`presentation_success` / `presentation_error`, read off the hydrated exchange.

Failures that cannot be attributed to one profile say so rather than guessing: a
dismissed OS sheet means no profile answered, so it reports the full offered set.
A response that matches no pending request is its own event type,
`presentation_dc_api_unresolved`, carrying the protocol and the candidate
profiles but no `profile`.

## Consequences

- Any new DC API profile must declare its protocol in
  `PROFILE_DC_API_PROTOCOL`, and a profile that can emit more than one protocol
  breaks response routing. `18013-7-Annex-D` is the only handler whose protocol
  depends on a request option (`signed`), and a test pins that
  `identifyProfile` always resolves it to the signed variant.
- Buttons combining two profiles of the same wire format are a config error.
- Exchanges written before this change still complete: `readPendingRequests`
  synthesizes a single entry from the legacy flat slot. That path is removable
  one release after rollout.
- `variables.dcApiRequests` holds ephemeral private key material and is scrubbed
  in `NativeWorkflowService.getExchange`.

## Known gap

The flat `hpkeRecipientPrivateKey` and `ephemeralKeyAgreementPrivateKey`
variables written by earlier releases are **not** covered by that scrub, so on a
full-scope `GET /workflows/:id/exchanges/:id` they remain readable by a holder of
the exchange access token. Pre-existing, not introduced here, and low severity
(single-use per-exchange keys, held by the intended recipient's own frontend).
Left for separate follow-up.
