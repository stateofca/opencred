/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Parse a single JSON string from a CSV @message column into a
 * normalized event object.
 *
 * @param {object} options - Options.
 * @param {string} options.json - Raw JSON string from the @message column.
 * @returns {object|null} Normalized event or null if not a
 *   presentation_event.
 */
export function parseEvent({json}) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  // `@message` is currently a hardcoded expectation in the log CSV. We could
  // refactor to be able to process CSVs with no header row using an index, or
  // allowing a parameterized message column name in the future.
  if(parsed['@message'] !== 'presentation_event') {
    return null;
  }

  const fields = parsed['@fields'] ?? {};
  const {type, exchangeId, clientId, profile, error} = fields;

  if(!exchangeId || !isValidType(type)) {
    return null;
  }

  const timestamp = new Date(parsed['@timestamp']);

  return {timestamp, type, exchangeId, clientId, profile, error};
}

function isValidType(type) {
  return type === 'presentation_start' ||
    type === 'presentation_success' ||
    type === 'presentation_error';
}
