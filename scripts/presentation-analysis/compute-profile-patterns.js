/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Analyze profile usage patterns across exchanges.
 *
 * @param {object} options - Options.
 * @param {Array} options.exchanges - Array of classified exchange objects.
 * @returns {object} Profile pattern analysis.
 */
export function computeProfilePatterns({exchanges}) {
  const profilesPerExchange = {
    0: 0,
    1: 0,
    2: 0,
    '3+': 0
  };
  const pathCounts = new Map();
  const transitionCounts = new Map();
  const successRateByTerminalProfile = {};

  for(const exchange of exchanges) {
    if(exchange.startCount < 1) {
      continue;
    }

    const profilePath = exchange.profilePath ?? [];
    const distinctCount = countDistinctProfiles(profilePath);
    profilesPerExchange[profileCountBucket(distinctCount)]++;

    const pathKey = JSON.stringify(profilePath);
    const pathStats = pathCounts.get(pathKey) ?? {
      path: profilePath,
      count: 0,
      successCount: 0,
      errorCount: 0,
      abandonedCount: 0
    };
    pathStats.count++;
    if(exchange.outcome === 'success') {
      pathStats.successCount++;
    } else if(exchange.outcome === 'error') {
      pathStats.errorCount++;
    } else if(exchange.outcome === 'abandoned') {
      pathStats.abandonedCount++;
    }
    pathCounts.set(pathKey, pathStats);

    for(let i = 0; i < profilePath.length - 1; i++) {
      const transitionKey = transitionPairKey(
        profilePath[i], profilePath[i + 1]);
      transitionCounts.set(
        transitionKey,
        (transitionCounts.get(transitionKey) ?? 0) + 1);
    }

    const profileKey = terminalProfileKey(exchange.terminalProfile);
    const profileStats = successRateByTerminalProfile[profileKey] ??
      createProfileSuccessStats();
    incrementProfileSuccessStats(profileStats, exchange);
    successRateByTerminalProfile[profileKey] = profileStats;
  }

  return {
    profilesPerExchange,
    pathFrequency: [...pathCounts.values()]
      .sort((a, b) => b.count - a.count),
    pairwiseTransitions: [...transitionCounts.entries()]
      .map(([key, count]) => {
        const {from, to} = parseTransitionPairKey(key);
        return {from, to, count};
      })
      .sort((a, b) => b.count - a.count),
    successRateByTerminalProfile: mapProfileSuccessStats(
      successRateByTerminalProfile)
  };
}

function countDistinctProfiles(profilePath) {
  const distinct = new Set();
  for(const profile of profilePath) {
    if(profile != null) {
      distinct.add(profile);
    }
  }
  return distinct.size;
}

function profileCountBucket(distinctCount) {
  if(distinctCount === 0) {
    return '0';
  }
  if(distinctCount === 1) {
    return '1';
  }
  if(distinctCount === 2) {
    return '2';
  }
  return '3+';
}

function createProfileSuccessStats() {
  return {
    total: 0,
    success: 0
  };
}

function incrementProfileSuccessStats(stats, exchange) {
  stats.total++;
  if(exchange.outcome === 'success') {
    stats.success++;
  }
}

function withProfileSuccessRate(stats) {
  return {
    total: stats.total,
    success: stats.success,
    successRate: stats.total > 0 ? stats.success / stats.total : 0
  };
}

function mapProfileSuccessStats(statsByKey) {
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

function transitionPairKey(from, to) {
  return `${JSON.stringify(from ?? null)}\0${JSON.stringify(to ?? null)}`;
}

function parseTransitionPairKey(key) {
  const separatorIndex = key.indexOf('\0');
  return {
    from: JSON.parse(key.slice(0, separatorIndex)),
    to: JSON.parse(key.slice(separatorIndex + 1))
  };
}
