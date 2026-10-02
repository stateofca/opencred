/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Coarse DC API error-reason buckets. Only the bucket is ever logged, never
 * the raw `DOMException` message, which can carry wallet-implementation
 * detail. Mirrors the log-safe bucketing of `classifyUserAgent`.
 */
export const DC_API_ERROR_REASON = {
  // No credential provider ever answered the platform request.
  NO_PROVIDER: 'no-provider',
  // A provider was reached but the cross-device/transport layer failed.
  TRANSPORT: 'transport',
  // Fetching or building the request envelope failed in or around the call.
  REQUEST_FETCH: 'request-fetch',
  // Unknown or unmapped message.
  OTHER: 'other'
};

/**
 * Ordered substring rules mapping a `DOMException` message to a reason bucket;
 * the first rule whose (lower-cased) `match` is contained in the (lower-cased)
 * message wins.
 *
 * Seeded empty on purpose: the real Chrome/Edge `NetworkError` strings are
 * learned in UAT (telemetry spec, Phase 1) and only then added here, so no
 * guessed production string ships. Until a rule exists, every real message
 * classifies as `other`.
 *
 * @type {Array<{match: string, reason: string}>}
 */
export const DC_API_ERROR_REASON_RULES = [];

/**
 * Classify a raw DC API error message into a coarse, log-safe reason bucket.
 * Pure (no IO): the same map serves a UAT console check and the prod server.
 *
 * @param {string} message - The raw `DOMException`/`Error` message.
 * @param {object} [options] - Options.
 * @param {Array<{match: string, reason: string}>} [options.rules] - Ordered
 *   substring rules; defaults to the module seed set.
 * @returns {string} One of the `DC_API_ERROR_REASON` values. Anything unknown,
 *   empty, or non-string returns `other`.
 */
export function classifyDcApiErrorReason(message, {
  rules = DC_API_ERROR_REASON_RULES
} = {}) {
  if(typeof message !== 'string' || message.length === 0) {
    return DC_API_ERROR_REASON.OTHER;
  }
  const normalized = message.toLowerCase();
  for(const {match, reason} of rules) {
    if(typeof match === 'string' && match.length > 0 &&
      normalized.includes(match.toLowerCase())) {
      return reason;
    }
  }
  return DC_API_ERROR_REASON.OTHER;
}
