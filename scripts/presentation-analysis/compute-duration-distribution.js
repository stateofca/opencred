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

/**
 * Compute duration statistics for successful exchanges.
 *
 * @param {object} options - Options.
 * @param {Array} options.exchanges - Array of classified exchange objects.
 * @returns {object} Duration distribution.
 */
export function computeDurationDistribution({exchanges}) {
  const durations = exchanges
    .filter(exchange =>
      exchange.outcome === 'success' && exchange.durationMs != null)
    .map(exchange => exchange.durationMs);

  const buckets = createEmptyBuckets();
  for(const durationMs of durations) {
    buckets[durationBucket(durationMs)]++;
  }

  if(durations.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      p50: null,
      p75: null,
      p90: null,
      p95: null,
      p99: null,
      buckets
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    p50: nearestRankPercentile(sorted, 50),
    p75: nearestRankPercentile(sorted, 75),
    p90: nearestRankPercentile(sorted, 90),
    p95: nearestRankPercentile(sorted, 95),
    p99: nearestRankPercentile(sorted, 99),
    buckets
  };
}

function createEmptyBuckets() {
  const buckets = {};
  for(const key of BUCKET_KEYS) {
    buckets[key] = 0;
  }
  return buckets;
}

function nearestRankPercentile(sorted, percentile) {
  const rank = Math.ceil(percentile / 100 * sorted.length);
  return sorted[rank - 1];
}

function durationBucket(durationMs) {
  if(durationMs < 5000) {
    return '0-5s';
  }
  if(durationMs < 15000) {
    return '5-15s';
  }
  if(durationMs < 30000) {
    return '15-30s';
  }
  if(durationMs < 60000) {
    return '30-60s';
  }
  if(durationMs < 120000) {
    return '1-2m';
  }
  if(durationMs < 300000) {
    return '2-5m';
  }
  return '5m+';
}
