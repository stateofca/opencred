/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build presentation_error for trustedCredentialIssuers rejection (no logging).
 * When `logLevel` is `'debug'`, includes `rejectedIssuer` DID for operators.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} options.rejectedIssuer - Issuer DID from the credential.
 * @param {'info'|'debug'} options.logLevel - Whether to attach issuer DID.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function rejectedIssuer({
  clientId,
  exchangeId,
  rejectedIssuer: rejectedIssuerDid,
  logLevel
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'presentation_error',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: 'Unaccepted credential issuer',
      ...(logLevel === 'debug' && {rejectedIssuer: rejectedIssuerDid})
    }
  };
}
