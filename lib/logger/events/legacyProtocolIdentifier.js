/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build a legacy protocol identifier telemetry event payload (no logging).
 *
 * @typedef {object} LegacyProtocolIdentifierMetadata
 * @property {string} [observedProtocol] - Legacy protocol string observed.
 * @property {string} [source] - Observing boundary.
 * @property {string} [profile] - Active profile when known.
 *
 * @param {object} options - Event fields.
 * @param {string | undefined} options.clientId - Workflow identifier.
 * @param {string | undefined} options.exchangeId - Exchange identifier.
 * @param {LegacyProtocolIdentifierMetadata} [options.metadata] - Telemetry.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function legacyProtocolIdentifier({clientId, exchangeId, metadata}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'legacy_protocol_identifier',
      clientId: clientId ?? 'unknown',
      exchangeId: exchangeId ?? 'unknown',
      error: undefined,
      ...(metadata && {metadata})
    }
  };
}
