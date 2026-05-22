/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {classifyExchange} from
  '../../../scripts/presentation-analysis/classify-exchange.js';
import {computeDurationDistribution} from
  '../../../scripts/presentation-analysis/compute-duration-distribution.js';
import {computeProfilePatterns} from
  '../../../scripts/presentation-analysis/compute-profile-patterns.js';
import {computeSuccessRate} from
  '../../../scripts/presentation-analysis/compute-success-rate.js';
import {groupExchanges} from
  '../../../scripts/presentation-analysis/group-exchanges.js';
import {parseEvent} from
  '../../../scripts/presentation-analysis/parse-events.js';

function makeEvent({
  type,
  exchangeId = 'ex1',
  clientId = 'test-client',
  profile,
  error,
  timestamp = '2026-05-08T06:55:32.847Z'
}) {
  return {
    timestamp: new Date(timestamp),
    type,
    exchangeId,
    clientId,
    profile,
    error
  };
}

function makePresentationJson({
  type,
  exchangeId = 'ex1',
  clientId = 'test-client',
  profile,
  error,
  timestamp = '2026-05-08T06:55:32.847Z',
  message = 'presentation_event'
}) {
  const fields = {
    clientId,
    exchangeId,
    level: 'info',
    module: 'opencred-platform',
    type,
    workerId: 'w1',
    workerPid: 1
  };
  if(profile !== undefined) {
    fields.profile = profile;
  }
  if(error !== undefined) {
    fields.error = error;
  }
  return JSON.stringify({
    '@fields': fields,
    '@message': message,
    '@timestamp': timestamp
  });
}

describe('parseEvent', () => {
  it('parses valid presentation_start JSON with all fields', () => {
    const json = makePresentationJson({
      type: 'presentation_start',
      profile: 'OID4VP-1.0'
    });
    const event = parseEvent({json});
    expect(event).to.eql({
      timestamp: new Date('2026-05-08T06:55:32.847Z'),
      type: 'presentation_start',
      exchangeId: 'ex1',
      clientId: 'test-client',
      profile: 'OID4VP-1.0',
      error: undefined
    });
  });

  it('includes profile on presentation_start when present', () => {
    const json = makePresentationJson({
      type: 'presentation_start',
      profile: 'OID4VP-1.0'
    });
    const event = parseEvent({json});
    expect(event.profile).to.equal('OID4VP-1.0');
  });

  it('parses valid presentation_success without profile or error', () => {
    const json = makePresentationJson({type: 'presentation_success'});
    const event = parseEvent({json});
    expect(event.type).to.equal('presentation_success');
    expect(event.profile).to.be(undefined);
    expect(event.error).to.be(undefined);
  });

  it('parses valid presentation_error with error field', () => {
    const json = makePresentationJson({
      type: 'presentation_error',
      error: 'timeout'
    });
    const event = parseEvent({json});
    expect(event.type).to.equal('presentation_error');
    expect(event.error).to.equal('timeout');
  });

  it('returns null for non-presentation_event messages', () => {
    const json = makePresentationJson({
      type: 'presentation_start',
      message: 'other_event'
    });
    expect(parseEvent({json})).to.be(null);
  });

  it('returns null when exchangeId is missing', () => {
    const json = JSON.stringify({
      '@fields': {
        clientId: 'test-client',
        level: 'info',
        module: 'opencred-platform',
        type: 'presentation_start'
      },
      '@message': 'presentation_event',
      '@timestamp': '2026-05-08T06:55:32.847Z'
    });
    expect(parseEvent({json})).to.be(null);
  });

  it('returns null for invalid JSON', () => {
    let result;
    try {
      result = parseEvent({json: '{not valid json'});
    } catch {
      expect().fail('parseEvent should not throw on invalid JSON');
    }
    expect(result).to.be(null);
  });
});

describe('groupExchanges', () => {
  it('groups events by exchangeId', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        exchangeId: 'ex-a',
        timestamp: '2026-05-08T06:55:00.000Z'
      }),
      makeEvent({
        type: 'presentation_success',
        exchangeId: 'ex-b',
        timestamp: '2026-05-08T06:56:00.000Z'
      }),
      makeEvent({
        type: 'presentation_start',
        exchangeId: 'ex-a',
        timestamp: '2026-05-08T06:55:10.000Z'
      })
    ];
    const grouped = groupExchanges({events});
    expect(grouped.size).to.equal(2);
    expect(grouped.get('ex-a')).to.have.length(2);
    expect(grouped.get('ex-b')).to.have.length(1);
  });

  it('sorts events within each group by timestamp ascending', () => {
    const events = [
      makeEvent({
        type: 'presentation_success',
        exchangeId: 'ex1',
        timestamp: '2026-05-08T06:56:00.000Z'
      }),
      makeEvent({
        type: 'presentation_start',
        exchangeId: 'ex1',
        timestamp: '2026-05-08T06:55:00.000Z'
      })
    ];
    const grouped = groupExchanges({events});
    const sorted = grouped.get('ex1');
    expect(sorted[0].type).to.equal('presentation_start');
    expect(sorted[1].type).to.equal('presentation_success');
  });

  it('returns a Map', () => {
    const grouped = groupExchanges({events: []});
    expect(grouped).to.be.a(Map);
  });

  it('returns an empty Map for empty input', () => {
    const grouped = groupExchanges({events: []});
    expect(grouped.size).to.equal(0);
  });
});

describe('classifyExchange', () => {
  it('classifies start + success as success with duration and no \
anomaly', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        timestamp: '2026-05-08T06:55:00.000Z'
      }),
      makeEvent({
        type: 'presentation_success',
        timestamp: '2026-05-08T06:55:05.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.outcome).to.equal('success');
    expect(result.durationMs).to.equal(5000);
    expect(result.anomaly).to.be(false);
  });

  it('classifies start + error as error with error field populated', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        timestamp: '2026-05-08T06:55:00.000Z'
      }),
      makeEvent({
        type: 'presentation_error',
        error: 'wallet declined',
        timestamp: '2026-05-08T06:55:05.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.outcome).to.equal('error');
    expect(result.error).to.equal('wallet declined');
  });

  it('classifies start only as abandoned with null terminalAt and \
duration', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        timestamp: '2026-05-08T06:55:00.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.outcome).to.equal('abandoned');
    expect(result.terminalAt).to.be(null);
    expect(result.durationMs).to.be(null);
  });

  it('classifies start + error + later success as success with anomaly', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        timestamp: '2026-05-08T06:55:00.000Z'
      }),
      makeEvent({
        type: 'presentation_error',
        error: 'retry',
        timestamp: '2026-05-08T06:55:05.000Z'
      }),
      makeEvent({
        type: 'presentation_success',
        timestamp: '2026-05-08T06:55:10.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.outcome).to.equal('success');
    expect(result.anomaly).to.be(true);
  });

  it('uses last start before success for durationMs with multiple \
starts', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        timestamp: '2026-05-08T06:55:00.000Z'
      }),
      makeEvent({
        type: 'presentation_start',
        timestamp: '2026-05-08T06:55:02.000Z'
      }),
      makeEvent({
        type: 'presentation_success',
        timestamp: '2026-05-08T06:55:07.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.durationMs).to.equal(5000);
  });

  it('records profilePath in order for multiple starts with different \
profiles', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        profile: 'OID4VP-1.0',
        timestamp: '2026-05-08T06:55:00.000Z'
      }),
      makeEvent({
        type: 'presentation_start',
        profile: '18013-7',
        timestamp: '2026-05-08T06:55:02.000Z'
      }),
      makeEvent({
        type: 'presentation_success',
        timestamp: '2026-05-08T06:55:07.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.profilePath).to.eql(['OID4VP-1.0', '18013-7']);
  });

  it('records repeated profiles in profilePath for multiple \
same-profile starts', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        profile: 'OID4VP-1.0',
        timestamp: '2026-05-08T06:55:00.000Z'
      }),
      makeEvent({
        type: 'presentation_start',
        profile: 'OID4VP-1.0',
        timestamp: '2026-05-08T06:55:02.000Z'
      }),
      makeEvent({
        type: 'presentation_success',
        timestamp: '2026-05-08T06:55:07.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.profilePath).to.eql(['OID4VP-1.0', 'OID4VP-1.0']);
  });

  it('normalizes missing profile to null in profilePath', () => {
    const events = [
      makeEvent({
        type: 'presentation_start',
        timestamp: '2026-05-08T06:55:00.000Z'
      }),
      makeEvent({
        type: 'presentation_start',
        timestamp: '2026-05-08T06:55:02.000Z'
      }),
      makeEvent({
        type: 'presentation_success',
        timestamp: '2026-05-08T06:55:07.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.profilePath).to.eql([null, null]);
    expect(result.terminalProfile).to.be(null);
  });

  it('handles success-only events with no starts gracefully', () => {
    const events = [
      makeEvent({
        type: 'presentation_success',
        timestamp: '2026-05-08T06:55:05.000Z'
      })
    ];
    const result = classifyExchange({exchangeId: 'ex1', events});
    expect(result.outcome).to.equal('success');
    expect(result.startCount).to.equal(0);
    expect(result.durationMs).to.be(null);
    expect(result.profilePath).to.eql([]);
  });
});

describe('computeSuccessRate', () => {
  it('computes correct counts and rates for mixed outcomes by clientId', () => {
    const exchanges = [
      {
        clientId: 'client-a',
        outcome: 'success',
        anomaly: false,
        startCount: 1,
        terminalProfile: 'OID4VP-1.0'
      },
      {
        clientId: 'client-a',
        outcome: 'error',
        anomaly: false,
        startCount: 1,
        terminalProfile: 'OID4VP-1.0'
      },
      {
        clientId: 'client-a',
        outcome: 'abandoned',
        anomaly: false,
        startCount: 1,
        terminalProfile: 'OID4VP-1.0'
      }
    ];
    const result = computeSuccessRate({exchanges});
    expect(result.overall).to.eql({
      total: 3,
      success: 1,
      error: 1,
      abandoned: 1,
      anomaly: 0,
      successRate: 1 / 3
    });
    expect(result.byClientId['client-a']).to.eql({
      total: 3,
      success: 1,
      error: 1,
      abandoned: 1,
      anomaly: 0,
      successRate: 1 / 3
    });
  });

  it('groups multiple clientIds separately', () => {
    const exchanges = [
      {
        clientId: 'client-a',
        outcome: 'success',
        anomaly: false,
        startCount: 1,
        terminalProfile: 'OID4VP-1.0'
      },
      {
        clientId: 'client-b',
        outcome: 'error',
        anomaly: false,
        startCount: 1,
        terminalProfile: '18013-7'
      }
    ];
    const result = computeSuccessRate({exchanges});
    expect(result.byClientId['client-a'].success).to.equal(1);
    expect(result.byClientId['client-b'].error).to.equal(1);
  });

  it('uses "(none)" for byProfile when terminalProfile is null', () => {
    const exchanges = [
      {
        clientId: 'client-a',
        outcome: 'success',
        anomaly: false,
        startCount: 1,
        terminalProfile: null
      }
    ];
    const result = computeSuccessRate({exchanges});
    expect(result.byProfile['(none)']).to.eql({
      total: 1,
      success: 1,
      error: 0,
      abandoned: 0,
      successRate: 1
    });
  });
});

describe('computeDurationDistribution', () => {
  it('computes min, max, mean, and percentiles for known durations', () => {
    const exchanges = [
      {outcome: 'success', durationMs: 1000},
      {outcome: 'success', durationMs: 2000},
      {outcome: 'success', durationMs: 3000},
      {outcome: 'success', durationMs: 4000},
      {outcome: 'success', durationMs: 5000}
    ];
    const result = computeDurationDistribution({exchanges});
    expect(result.count).to.equal(5);
    expect(result.min).to.equal(1000);
    expect(result.max).to.equal(5000);
    expect(result.mean).to.equal(3000);
    expect(result.p50).to.equal(3000);
    expect(result.p75).to.equal(4000);
    expect(result.p90).to.equal(5000);
    expect(result.p95).to.equal(5000);
    expect(result.p99).to.equal(5000);
  });

  it('assigns exactly 5000ms to the 5-15s bucket', () => {
    const exchanges = [
      {outcome: 'success', durationMs: 5000}
    ];
    const result = computeDurationDistribution({exchanges});
    expect(result.buckets['5-15s']).to.equal(1);
    expect(result.buckets['0-5s']).to.equal(0);
  });

  it('returns zeros and empty stats when no successful exchanges exist', () => {
    const exchanges = [
      {outcome: 'error', durationMs: 1000},
      {outcome: 'abandoned', durationMs: null}
    ];
    const result = computeDurationDistribution({exchanges});
    expect(result.count).to.equal(0);
    expect(result.min).to.be(null);
    expect(result.max).to.be(null);
    expect(result.mean).to.be(null);
    expect(result.p50).to.be(null);
    expect(result.buckets).to.eql({
      '0-5s': 0,
      '5-15s': 0,
      '15-30s': 0,
      '30-60s': 0,
      '1-2m': 0,
      '2-5m': 0,
      '5m+': 0
    });
  });
});

describe('computeProfilePatterns', () => {
  it('counts single-profile exchanges in profilesPerExchange "1"', () => {
    const exchanges = [
      {
        startCount: 1,
        profilePath: ['OID4VP-1.0'],
        outcome: 'success',
        terminalProfile: 'OID4VP-1.0'
      }
    ];
    const result = computeProfilePatterns({exchanges});
    expect(result.profilesPerExchange['1']).to.equal(1);
  });

  it('counts multi-profile exchanges in "2" and "3+" buckets', () => {
    const exchanges = [
      {
        startCount: 2,
        profilePath: ['OID4VP-1.0', '18013-7'],
        outcome: 'success',
        terminalProfile: '18013-7'
      },
      {
        startCount: 3,
        profilePath: ['A', 'B', 'C'],
        outcome: 'error',
        terminalProfile: 'C'
      }
    ];
    const result = computeProfilePatterns({exchanges});
    expect(result.profilesPerExchange['2']).to.equal(1);
    expect(result.profilesPerExchange['3+']).to.equal(1);
  });

  it('counts path frequency correctly', () => {
    const exchanges = [
      {
        startCount: 1,
        profilePath: ['OID4VP-1.0'],
        outcome: 'success',
        terminalProfile: 'OID4VP-1.0'
      },
      {
        startCount: 1,
        profilePath: ['OID4VP-1.0'],
        outcome: 'error',
        terminalProfile: 'OID4VP-1.0'
      }
    ];
    const result = computeProfilePatterns({exchanges});
    expect(result.pathFrequency).to.have.length(1);
    expect(result.pathFrequency[0]).to.eql({
      path: ['OID4VP-1.0'],
      count: 2,
      successCount: 1,
      errorCount: 1,
      abandonedCount: 0
    });
  });

  it('counts pairwise transitions for repeated and changed profiles', () => {
    const exchanges = [
      {
        startCount: 3,
        profilePath: ['A', 'A', 'B'],
        outcome: 'success',
        terminalProfile: 'B'
      }
    ];
    const result = computeProfilePatterns({exchanges});
    const transitions = Object.fromEntries(
      result.pairwiseTransitions.map(({from, to, count}) => [
        `${from}->${to}`, count
      ])
    );
    expect(transitions['A->A']).to.equal(1);
    expect(transitions['A->B']).to.equal(1);
  });

  it('handles multi-start exchanges with missing profiles', () => {
    const exchanges = [
      {
        startCount: 2,
        profilePath: [null, null],
        outcome: 'success',
        terminalProfile: null
      }
    ];
    const result = computeProfilePatterns({exchanges});
    expect(result.profilesPerExchange['0']).to.equal(1);
    expect(result.pairwiseTransitions).to.eql([
      {from: null, to: null, count: 1}
    ]);
  });

  it('counts all-null profile paths in profilesPerExchange "0"', () => {
    const exchanges = [
      {
        startCount: 1,
        profilePath: [null],
        outcome: 'abandoned',
        terminalProfile: null
      }
    ];
    const result = computeProfilePatterns({exchanges});
    expect(result.profilesPerExchange['0']).to.equal(1);
  });
});
