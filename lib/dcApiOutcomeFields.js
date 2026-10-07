/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {classifyUserAgentDetail} from '../common/userAgent.js';
import {createHash} from 'node:crypto';

/**
 * Cap on every raw client text field (error message, cause, User-Agent). The
 * client applies the same cap; the server enforces it because the beacon body
 * is untrusted.
 */
export const MAX_DC_API_TEXT_LENGTH = 1000;

// Longest plausible wait for a `navigator.credentials.get` outcome. The client
// times out at 30 seconds; anything past this bound is malformed.
const MAX_ELAPSED_MS = 10 * 60 * 1000;

// DOMException legacy codes are small integers (0-25 today).
const MAX_ERROR_CODE = 1000;

const PHASES = new Set(['fetch', 'submit']);
const VISIBILITY_STATES = new Set(['visible', 'hidden', 'prerender']);
const CONTEXT_BOOLEANS = [
  'userActivationIsActive',
  'userActivationHasBeenActive',
  'hasFocus',
  'inIframe',
  'digitalCredentialDefined'
];
// DC API protocol identifiers (`openid4vp-v1-signed`, `org-iso-mdoc`, ...).
const PROTOCOL_PATTERN = /^[A-Za-z0-9._:/-]{1,100}$/;
const MAX_PROTOCOLS = 10;

/**
 * Validate the DC API outcome fields of a client beacon body and return only
 * the ones that are safe to log. Pure (no IO, no config read): the caller
 * decides whether diagnostics are enabled.
 *
 * Always returned (when well-formed): `elapsedMs`, `errorCode`, a short
 * `errorMessageHash`, `os`/`browserMajorVersion` buckets, a whitelisted
 * `context`, `phase`, and `httpStatus`. None of these carry raw client text.
 *
 * Returned only when `diagnosticsEnabled` is true: a `diagnostics` object with
 * the capped raw `errorMessage`, `errorCause`, and `userAgent`. This exists for
 * a diagnostic deployment that must see unmapped platform error strings; it is
 * off by default (`options.dcApiDiagnostics`).
 *
 * @param {object} options - Options.
 * @param {object} [options.body] - The untrusted beacon request body.
 * @param {string} [options.userAgent] - The request's raw `User-Agent`.
 * @param {boolean} [options.diagnosticsEnabled] - Include raw client text.
 * @returns {object} The sanitized fields, ready to spread into an event.
 */
export function sanitizeDcApiOutcome({
  body = {}, userAgent, diagnosticsEnabled = false
} = {}) {
  const errorMessage = _capText(body.errorMessage);
  const context = _sanitizeContext(body.context);
  // `typeof` first: `Math.round` would coerce a string such as '5'.
  const elapsedMs = typeof body.elapsedMs === 'number' ?
    Math.round(body.elapsedMs) : undefined;
  const fields = {
    ...classifyUserAgentDetail(userAgent),
    ...(_isIntInRange(elapsedMs, 0, MAX_ELAPSED_MS) && {elapsedMs}),
    ...(_isIntInRange(body.errorCode, 0, MAX_ERROR_CODE) &&
      {errorCode: body.errorCode}),
    ...(errorMessage && {errorMessageHash: _hash(errorMessage)}),
    ...(PHASES.has(body.phase) && {phase: body.phase}),
    ...(_isIntInRange(body.httpStatus, 100, 599) &&
      {httpStatus: body.httpStatus}),
    ...(context && {context})
  };

  if(diagnosticsEnabled) {
    const errorCause = _capText(body.errorCause);
    const rawUserAgent = _capText(userAgent);
    fields.diagnostics = {
      ...(errorMessage && {errorMessage}),
      ...(errorCause && {errorCause}),
      ...(rawUserAgent && {userAgent: rawUserAgent})
    };
  }
  return fields;
}

function _capText(value) {
  return typeof value === 'string' && value.length > 0 ?
    value.slice(0, MAX_DC_API_TEXT_LENGTH) : undefined;
}

function _isIntInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

// A short digest lets distinct unmapped messages be counted and matched to a
// local reproduction without logging their text.
function _hash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function _sanitizeContext(value) {
  if(!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const context = {};
  for(const key of CONTEXT_BOOLEANS) {
    if(typeof value[key] === 'boolean') {
      context[key] = value[key];
    }
  }
  if(VISIBILITY_STATES.has(value.visibilityState)) {
    context.visibilityState = value.visibilityState;
  }
  if(Array.isArray(value.protocolSupport)) {
    context.protocolSupport = value.protocolSupport
      .filter(entry =>
        entry && typeof entry === 'object' &&
        typeof entry.protocol === 'string' &&
        PROTOCOL_PATTERN.test(entry.protocol) &&
        (typeof entry.allowed === 'boolean' || entry.allowed === null))
      .slice(0, MAX_PROTOCOLS)
      .map(({protocol, allowed}) => ({protocol, allowed}));
  }
  return Object.keys(context).length > 0 ? context : undefined;
}
