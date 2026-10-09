/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build an mdoc issuer certificates event payload (no logging).
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {string} [options.profile] - OID4VP profile identifier: the profile
 *   that answered.
 * @param {Array<object>} options.documents - Per-document output of
 *   `describeIssuerCertificates` (`lib/mdocIssuerCertificate.js`).
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function mdocIssuerCertificates({
  clientId, exchangeId, profile, documents
}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'mdoc_issuer_certificates',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(profile && {profile}),
      documents
    }
  };
}
