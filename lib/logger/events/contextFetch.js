/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Emitted when the document loader fetches a JSON-LD context from the
 * network instead of serving it from a static package. This helps
 * identify contexts that should be added as static dependencies.
 *
 * @param {object} options - Event fields.
 * @param {string} options.url - The URL of the context being fetched.
 * @returns {{logName: string, event: object}} - Event payload.
 */
export function contextFetch({url}) {
  return {
    logName: 'presentation_event',
    event: {
      type: 'context_fetch',
      url
    }
  };
}
