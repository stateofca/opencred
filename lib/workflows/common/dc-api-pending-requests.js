/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {dcApiProtocolForProfile} from './dc-api-envelope.js';
import {isDeepStrictEqual} from 'node:util';

/**
 * Pending DC API authorization requests, and the two functions that convert
 * between how they are stored and the shape the profile response handlers
 * expect.
 *
 * A single `navigator.credentials.get()` call may carry several authorization
 * requests, so an exchange has to remember all of them until a wallet answers
 * one. Each DC API profile handler, however, writes its state into a single
 * flat slot on `exchange.variables` — `{profile, authorizationRequest,
 * …profile-specific key material…}` — and reads it back from exactly there when
 * verifying a response. Storing several requests therefore means namespacing
 * that state on the way in and restoring it on the way out.
 *
 * `extractRequestMaterial` and `hydratePendingRequest` are **exact inverses**
 * and live side by side for that reason: extract lifts a handler's additions to
 * `exchange.variables` into `entry.material`, and hydrate puts them back
 * verbatim so the handler sees the flat shape it was written against. Changing
 * one without the other silently breaks response verification for whichever
 * profile relies on the field that stopped round-tripping. They are covered
 * together by `test/unit/workflows/59-dc-api-pending-requests.test.js`.
 *
 * A pending entry is built **only** from the handler's
 * `updatedExchange.variables` — both the named `authorizationRequest` field and
 * the `material` come from that one object, never from the handler's return
 * shape. That is why the round-trip holds even for profiles like Annex C, which
 * do not surface `authorizationRequest` at the top level of their result.
 */

/**
 * The variables a profile handler added, relative to the exchange it was given.
 *
 * `profile` and `authorizationRequest` are excluded because they are stored as
 * named fields on the pending request rather than inside `material`.
 *
 * Comparison is deep, not by reference: some handlers derive their result with
 * `klona(exchange)`, so every nested value is a fresh reference even when the
 * value is unchanged. A reference comparison would classify the entire
 * pre-existing variables object as new material and duplicate exchange state —
 * including session secrets — into every pending request.
 *
 * A handler that mutates a nested object in place rather than replacing it is
 * not detected as having added material. No current handler does that, and the
 * abstraction is "variables this handler contributed", not "every byte that
 * changed anywhere".
 *
 * @param {object} options - Options.
 * @param {object} [options.variablesBefore] - `exchange.variables` captured
 *   before the handler ran. Snapshot it beforehand: a handler is free to write
 *   through to the same object.
 * @param {object} [options.variablesAfter] - `updatedExchange.variables` as
 *   returned by the handler.
 * @returns {object} The added or changed variables.
 */
export function extractRequestMaterial({
  variablesBefore = {}, variablesAfter = {}
} = {}) {
  const material = {};
  for(const [key, value] of Object.entries(variablesAfter)) {
    if(key === 'profile' || key === 'authorizationRequest') {
      continue;
    }
    if(key in variablesBefore &&
      isDeepStrictEqual(variablesBefore[key], value)) {
      continue;
    }
    material[key] = value;
  }
  return material;
}

/**
 * Build the stored representation of one pending DC API authorization request.
 *
 * The entry is derived entirely from the handler's `variablesAfter`: both the
 * named `authorizationRequest` field and the `material` come from there, never
 * from the handler's return shape. A handler that writes `authorizationRequest`
 * only into `updatedExchange.variables` (Annex C) is therefore stored the same
 * as one that also returns it at the top level.
 *
 * @param {object} options - Options.
 * @param {string} options.profile - Resolved profile identifier.
 * @param {string} options.requestGroupId - Correlates every request issued by
 *   the same authorization request call, and the response that answers one of
 *   them, in the event log.
 * @param {object} [options.variablesBefore] - `exchange.variables` captured
 *   before the handler ran. Snapshot it beforehand: a handler is free to write
 *   through to the same object.
 * @param {object} [options.variablesAfter] - `updatedExchange.variables` as
 *   returned by the handler.
 * @returns {object} The pending request entry.
 */
export function buildPendingRequest({
  profile, requestGroupId, variablesBefore = {}, variablesAfter = {}
} = {}) {
  const material = extractRequestMaterial({variablesBefore, variablesAfter});
  const {authorizationRequest} = variablesAfter;
  const protocol = dcApiProtocolForProfile({profile});
  // The ephemeral response-encryption key, when the handler generated one,
  // carries a per-request `kid` that a conforming wallet echoes in the JWE
  // protected header. Lifted out here so response routing can cross-check it
  // without having to know which profile stores its key under which name.
  const kid = _findEphemeralKid(material);
  return {
    profile,
    protocol,
    requestGroupId,
    ...(kid ? {kid} : {}),
    ...(authorizationRequest ? {authorizationRequest} : {}),
    material
  };
}

/**
 * Restore a pending request into the flat `exchange.variables` shape that the
 * profile response handlers read.
 *
 * The returned exchange is a synthetic view for the duration of one response:
 * it is what gets handed to the handler, and the handler's own returned
 * `updatedExchange` — derived from this view — is what gets persisted. That is
 * deliberate. On a successful response the exchange completes, and the flat
 * shape reconstructed here is exactly the shape a completed exchange has always
 * had, so callbacks, audit, and the success view see no change.
 *
 * Exact inverse of `extractRequestMaterial`; see the module comment.
 *
 * @param {object} options - Options.
 * @param {object} options.exchange - The real, stored exchange.
 * @param {object} options.entry - The matched pending request entry.
 * @returns {object} Synthetic exchange with flat variables.
 */
export function hydratePendingRequest({exchange, entry} = {}) {
  return {
    ...exchange,
    variables: {
      ...exchange?.variables,
      profile: entry.profile,
      ...(entry.authorizationRequest ?
        {authorizationRequest: entry.authorizationRequest} : {}),
      ...entry.material
    }
  };
}

/**
 * Read the pending requests from an exchange, tolerating exchanges written
 * before multi-profile support existed.
 *
 * The compat path synthesizes a single entry from the old flat slot so that
 * exchanges already in flight when this ships still complete. Removable one
 * release after rollout.
 *
 * @param {object} options - Options.
 * @param {object} options.exchange - The exchange.
 * @returns {Array<object>} Pending request entries; empty when there are none.
 */
export function readPendingRequests({exchange} = {}) {
  const stored = exchange?.variables?.dcApiRequests;
  if(Array.isArray(stored) && stored.length > 0) {
    return stored;
  }

  const {profile, authorizationRequest} = exchange?.variables ?? {};
  if(!profile) {
    return [];
  }
  // Legacy flat slot: the whole of `variables` is this request's material, so
  // hydration is a no-op and the handler reads what it already wrote.
  return [{
    profile,
    protocol: dcApiProtocolForProfile({profile}),
    requestGroupId: null,
    ...(authorizationRequest ? {authorizationRequest} : {}),
    material: {},
    legacy: true
  }];
}

/**
 * Whether a (hydrated) exchange carries the state a DC API response handler
 * needs to verify a response: either an `authorizationRequest` or a
 * `dcApiSession`. The single copy of the invariant the response-side guard
 * applies, so the request side can assert the same thing at persist time.
 *
 * @param {object} options - Options.
 * @param {object} [options.variables] - The exchange variables to check.
 * @returns {boolean} True when response state is present.
 */
export function hasResponseState({variables} = {}) {
  return !!(variables?.authorizationRequest || variables?.dcApiSession);
}

function _findEphemeralKid(material) {
  for(const value of Object.values(material ?? {})) {
    if(value && typeof value === 'object' && typeof value.kid === 'string') {
      return value.kid;
    }
  }
  return null;
}
