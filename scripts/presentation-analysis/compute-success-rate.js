/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Compute success rate grouped by clientId and by terminal profile.
 *
 * @param {object} options - Options.
 * @param {Array} options.exchanges - Array of classified exchange objects.
 * @returns {object} Success rate results.
 */
export function computeSuccessRate({exchanges}) {
  const byClientId = {};
  const byProfile = {};
  const overall = createOutcomeStats();

  for(const exchange of exchanges) {
    if(exchange.startCount < 1) {
      continue;
    }

    incrementOutcomeStats(overall, exchange);

    const clientStats = byClientId[exchange.clientId] ??
      createOutcomeStats();
    incrementOutcomeStats(clientStats, exchange);
    byClientId[exchange.clientId] = clientStats;

    const profileKey = terminalProfileKey(exchange.terminalProfile);
    const profileStats = byProfile[profileKey] ?? createProfileStats();
    incrementProfileStats(profileStats, exchange);
    byProfile[profileKey] = profileStats;
  }

  return {
    byClientId: mapOutcomeStats(byClientId),
    byProfile: mapProfileStats(byProfile),
    overall: withSuccessRate(overall)
  };
}

function createOutcomeStats() {
  return {
    total: 0,
    success: 0,
    error: 0,
    abandoned: 0,
    anomaly: 0
  };
}

function createProfileStats() {
  return {
    total: 0,
    success: 0,
    error: 0,
    abandoned: 0
  };
}

function incrementOutcomeStats(stats, exchange) {
  stats.total++;
  if(exchange.outcome === 'success') {
    stats.success++;
  } else if(exchange.outcome === 'error') {
    stats.error++;
  } else if(exchange.outcome === 'abandoned') {
    stats.abandoned++;
  }
  if(exchange.anomaly) {
    stats.anomaly++;
  }
}

function incrementProfileStats(stats, exchange) {
  stats.total++;
  if(exchange.outcome === 'success') {
    stats.success++;
  } else if(exchange.outcome === 'error') {
    stats.error++;
  } else if(exchange.outcome === 'abandoned') {
    stats.abandoned++;
  }
}

function withSuccessRate(stats) {
  return {
    ...stats,
    successRate: stats.total > 0 ? stats.success / stats.total : 0
  };
}

function withProfileSuccessRate(stats) {
  return {
    total: stats.total,
    success: stats.success,
    error: stats.error,
    abandoned: stats.abandoned,
    successRate: stats.total > 0 ? stats.success / stats.total : 0
  };
}

function mapOutcomeStats(statsByKey) {
  const mapped = {};
  for(const [key, stats] of Object.entries(statsByKey)) {
    mapped[key] = withSuccessRate(stats);
  }
  return mapped;
}

function mapProfileStats(statsByKey) {
  const mapped = {};
  for(const [key, stats] of Object.entries(statsByKey)) {
    mapped[key] = withProfileSuccessRate(stats);
  }
  return mapped;
}

function terminalProfileKey(terminalProfile) {
  if(terminalProfile == null) {
    return '(none)';
  }
  return terminalProfile;
}
