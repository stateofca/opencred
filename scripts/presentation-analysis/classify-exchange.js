/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Classify the outcome of a single exchange from its sorted events.
 *
 * @param {object} options - Options.
 * @param {string} options.exchangeId - The exchange identifier.
 * @param {Array} options.events - Sorted (ascending) events for this exchange.
 * @returns {object} Classified exchange summary.
 */
export function classifyExchange({exchangeId, events}) {
  const starts = filterEventsByType({events, type: 'presentation_start'});
  const successes = filterEventsByType({
    events, type: 'presentation_success'
  });
  const errors = filterEventsByType({events, type: 'presentation_error'});

  let outcome;
  let anomaly = false;

  if(successes.length > 0) {
    outcome = 'success';
    if(errors.length > 0) {
      anomaly = true;
    }
  } else if(errors.length > 0) {
    outcome = 'error';
  } else {
    outcome = 'abandoned';
  }

  let terminalEvent = null;
  if(successes.length > 0) {
    terminalEvent = successes[successes.length - 1];
  } else if(errors.length > 0) {
    terminalEvent = errors[errors.length - 1];
  }

  let lastStartBeforeTerminal = null;
  if(terminalEvent) {
    const startsBeforeTerminal = starts.filter(
      start => start.timestamp <= terminalEvent.timestamp
    );
    if(startsBeforeTerminal.length > 0) {
      lastStartBeforeTerminal =
        startsBeforeTerminal[startsBeforeTerminal.length - 1];
    } else {
      lastStartBeforeTerminal = starts[starts.length - 1] ?? null;
    }
  }

  let durationMs = null;
  if(terminalEvent && lastStartBeforeTerminal) {
    durationMs =
      terminalEvent.timestamp - lastStartBeforeTerminal.timestamp;
  }

  const profilePath = starts.map(start => start.profile ?? null);
  const terminalProfile = lastStartBeforeTerminal?.profile ?? null;
  const clientId = events[0]?.clientId ?? null;
  const error = errors.length > 0 ?
    errors[errors.length - 1].error ?? null :
    null;

  const startCount = starts.length;
  const firstStartAt = starts.length > 0 ?
    starts[0].timestamp.toISOString() :
    null;
  const lastStartAt = starts.length > 0 ?
    starts[starts.length - 1].timestamp.toISOString() :
    null;
  const terminalAt = terminalEvent ?
    terminalEvent.timestamp.toISOString() :
    null;

  return {
    exchangeId,
    clientId,
    outcome,
    anomaly,
    startCount,
    firstStartAt,
    lastStartAt,
    terminalAt,
    durationMs,
    terminalProfile,
    profilePath,
    error
  };
}

/**
 * Filter events by presentation event type.
 *
 * @param {object} options - Options.
 * @param {Array} options.events - Events to filter.
 * @param {string} options.type - Event type to match.
 * @returns {Array} Matching events.
 */
function filterEventsByType({events, type}) {
  return events.filter(event => event.type === type);
}
