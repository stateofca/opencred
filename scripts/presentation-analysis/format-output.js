/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

const BUCKET_KEYS = [
  '0-5s',
  '5-15s',
  '15-30s',
  '30-60s',
  '1-2m',
  '2-5m',
  '5m+'
];

const CSV_HEADER = [
  'exchangeId',
  'clientId',
  'outcome',
  'anomaly',
  'startCount',
  'firstStartAt',
  'lastStartAt',
  'terminalAt',
  'durationMs',
  'terminalProfile',
  'profilePath',
  'error'
].join(',');

/**
 * Format analysis results as a human-readable console summary string.
 *
 * @param {object} options - Options.
 * @param {object} options.successRate - Output from computeSuccessRate.
 * @param {object} options.duration - Output from computeDurationDistribution.
 * @param {object} options.profilePatterns - Output from computeProfilePatterns.
 * @param {number} options.totalEvents - Total parsed events count.
 * @param {number} options.totalExchanges - Total classified exchanges count.
 * @returns {string} Formatted summary for console output.
 */
export function formatConsoleSummary({
  successRate, duration, profilePatterns, totalEvents, totalExchanges
}) {
  const lines = [];
  const today = new Date().toISOString().slice(0, 10);
  const {overall, byClientId, byProfile} = successRate;
  const {profilesPerExchange, pathFrequency, pairwiseTransitions} =
    profilePatterns;

  lines.push('=== Presentation Event Analysis ===');
  lines.push(`Date: ${today}`);
  lines.push(`Events parsed: ${totalEvents}`);
  lines.push(`Unique exchanges: ${totalExchanges}`);
  lines.push('');
  lines.push('--- Overall Success Rate ---');
  lines.push(formatOverallSuccessLine(overall));
  lines.push(`Anomalies (success+error): ${overall.anomaly}`);
  lines.push('');
  lines.push('--- By Client ID ---');
  lines.push(...formatByClientIdLines(byClientId));
  lines.push('');
  lines.push('--- Duration Distribution (successful exchanges) ---');
  lines.push(formatDurationCountLine(duration));
  lines.push(formatDurationPercentileLine(duration));
  lines.push(formatDurationBucketsLine(duration));
  lines.push('');
  lines.push('--- Profile Patterns ---');
  lines.push(formatProfilesPerExchangeLine(profilesPerExchange));
  lines.push(`Top paths: ${formatTopPaths(pathFrequency)}`);
  lines.push(`Top transitions: ${formatTopTransitions(pairwiseTransitions)}`);
  lines.push('');
  lines.push('--- Success Rate by Profile ---');
  lines.push(...formatByProfileLines(byProfile));

  return lines.join('\n');
}

/**
 * Format classified exchanges as CSV string (with header row).
 *
 * @param {object} options - Options.
 * @param {Array} options.exchanges - Classified exchange objects.
 * @returns {string} CSV content.
 */
export function formatExchangeCsv({exchanges}) {
  const rows = [CSV_HEADER];
  for(const exchange of exchanges) {
    rows.push(formatExchangeRow(exchange));
  }
  return `${rows.join('\n')}\n`;
}

function formatOverallSuccessLine(overall) {
  const {total, success, error, abandoned} = overall;
  return [
    `Total: ${total}`,
    `Success: ${success} (${formatRatePercent(success, total)})`,
    `Error: ${error} (${formatRatePercent(error, total)})`,
    `Abandoned: ${abandoned} (${formatRatePercent(abandoned, total)})`
  ].join(' | ');
}

function formatByClientIdLines(byClientId) {
  const clientIds = Object.keys(byClientId).sort();
  if(clientIds.length === 0) {
    return ['(none)'];
  }
  return clientIds.map(clientId => {
    const stats = byClientId[clientId];
    return [
      `${clientId}: ${stats.total} total`,
      `${formatPercent(stats.successRate)} success`,
      `${stats.error} error`,
      `${stats.abandoned} abandoned`
    ].join(' | ');
  });
}

function formatDurationCountLine(duration) {
  return [
    `Count: ${duration.count}`,
    `Min: ${formatDurationSeconds(duration.min)}`,
    `Max: ${formatDurationSeconds(duration.max)}`,
    `Mean: ${formatDurationSeconds(duration.mean)}`
  ].join(' | ');
}

function formatDurationPercentileLine(duration) {
  return [
    `p50: ${formatDurationSeconds(duration.p50)}`,
    `p75: ${formatDurationSeconds(duration.p75)}`,
    `p90: ${formatDurationSeconds(duration.p90)}`,
    `p95: ${formatDurationSeconds(duration.p95)}`,
    `p99: ${formatDurationSeconds(duration.p99)}`
  ].join(' | ');
}

function formatDurationBucketsLine(duration) {
  const parts = BUCKET_KEYS.map(
    key => `${key}: ${duration.buckets[key] ?? 0}`);
  return `Buckets: ${parts.join(' | ')}`;
}

function formatProfilesPerExchangeLine(profilesPerExchange) {
  const counts = [
    `0: ${profilesPerExchange['0'] ?? 0}`,
    `1: ${profilesPerExchange['1'] ?? 0}`,
    `2: ${profilesPerExchange['2'] ?? 0}`,
    `3+: ${profilesPerExchange['3+'] ?? 0}`
  ].join(' | ');
  return `Profiles per exchange: ${counts}`;
}

function formatTopPaths(pathFrequency, limit = 5) {
  if(pathFrequency.length === 0) {
    return '(none)';
  }
  return pathFrequency.slice(0, limit).map(entry => {
    return `${JSON.stringify(entry.path)}: ${entry.count}`;
  }).join(' | ');
}

function formatTopTransitions(pairwiseTransitions, limit = 5) {
  if(pairwiseTransitions.length === 0) {
    return '(none)';
  }
  return pairwiseTransitions.slice(0, limit).map(transition => {
    return [
      `${JSON.stringify(transition.from)} →`,
      `${JSON.stringify(transition.to)}:`,
      transition.count
    ].join(' ');
  }).join(' | ');
}

function formatByProfileLines(byProfile) {
  const profiles = Object.keys(byProfile).sort();
  if(profiles.length === 0) {
    return ['(none)'];
  }
  return profiles.map(profile => {
    const stats = byProfile[profile];
    return [
      `${profile}:`,
      `${formatPercent(stats.successRate)}`,
      `(${stats.success}/${stats.total})`
    ].join(' ');
  });
}

function formatExchangeRow(exchange) {
  const profilePath = JSON.stringify(exchange.profilePath ?? []);
  return [
    csvField(exchange.exchangeId),
    csvField(exchange.clientId),
    csvField(exchange.outcome),
    csvField(exchange.anomaly),
    csvField(exchange.startCount),
    csvField(exchange.firstStartAt),
    csvField(exchange.lastStartAt),
    csvField(exchange.terminalAt),
    csvField(exchange.durationMs),
    csvField(exchange.terminalProfile),
    csvQuotedField(profilePath),
    csvErrorField(exchange.error)
  ].join(',');
}

function csvField(value) {
  if(value == null) {
    return '';
  }
  return String(value);
}

function csvQuotedField(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvErrorField(error) {
  if(error == null) {
    return '';
  }
  const str = String(error);
  if(str.includes(',')) {
    return csvQuotedField(str);
  }
  return str;
}

function formatPercent(rate) {
  return `${Math.round(rate * 100)}%`;
}

function formatRatePercent(count, total) {
  if(total === 0) {
    return '0%';
  }
  return formatPercent(count / total);
}

function formatDurationSeconds(ms) {
  if(ms == null) {
    return 'n/a';
  }
  const seconds = ms / 1000;
  if(Number.isInteger(seconds)) {
    return `${seconds}s`;
  }
  return `${seconds.toFixed(1)}s`;
}
