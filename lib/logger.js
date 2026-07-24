/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {loggers} from '@bedrock/core';

// Underlying bedrock (winston) logger for this app.
const _base = loggers.get('app').child('opencred-platform');

// `@bedrock/core` swaps the logger's winston levels when its logging subsystem
// initializes during `bedrock.start()`. Before init (e.g. in `test:unit`, which
// never boots bedrock) the base logger exposes winston's default npm levels
// (so `.warn` exists but `.warning` does not); after init it exposes bedrock's
// syslog-style levels (so `.warning`/`.critical` exist but `.warn` does not).
// This facade delegates to the live base logger and resolves each level to
// whichever method currently exists, giving callers a stable surface
// (`logger.warning`, `logger.critical`, ...) regardless of init state.
// Delegation happens at call time so the post-init prototype swap is picked up
// automatically.
const LEVEL_FALLBACKS = {
  silly: [],
  verbose: [],
  debug: [],
  info: [],
  warning: ['warn'],
  error: [],
  critical: ['error']
};

function _delegate(level) {
  const candidates = [level, ...LEVEL_FALLBACKS[level]];
  return function(...args) {
    for(const name of candidates) {
      if(typeof _base[name] === 'function') {
        return _base[name](...args);
      }
    }
    // last resort: use the generic winston `log(level, ...)` signature
    return _base.log(level, ...args);
  };
}

export const logger = {
  child(...args) {
    return _base.child(...args);
  }
};

for(const level of Object.keys(LEVEL_FALLBACKS)) {
  logger[level] = _delegate(level);
}
