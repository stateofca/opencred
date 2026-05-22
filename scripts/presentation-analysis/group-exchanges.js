/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Group normalized events by exchangeId and sort each group by timestamp.
 *
 * @param {object} options - Options.
 * @param {Array} options.events - Array of normalized event objects.
 * @returns {Map<string, Array>} Map of exchangeId → sorted events array.
 */
export function groupExchanges({events}) {
  const grouped = new Map();

  for(const event of events) {
    const {exchangeId} = event;
    if(!grouped.has(exchangeId)) {
      grouped.set(exchangeId, []);
    }
    grouped.get(exchangeId).push(event);
  }

  for(const exchangeEvents of grouped.values()) {
    exchangeEvents.sort((a, b) => a.timestamp - b.timestamp);
  }

  return grouped;
}
