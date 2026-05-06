/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {callbackSuccess} from './callbackSuccess.js';
import {legacyProtocolIdentifier} from './legacyProtocolIdentifier.js';
import {logger} from '../../logger.js';
import {presentationError} from './presentationError.js';
import {presentationStart} from './presentationStart.js';
import {presentationSuccess} from './presentationSuccess.js';

function emit(builder, opts) {
  const {logName, event} = builder(opts);
  logger.info(logName, event);
}

/**
 * Convenience API matching historical `common/utils.js` signatures;
 * emits at `logger.info`.
 */
export const logUtils = {
  presentationStart: (clientId, exchangeId, profile) =>
    emit(presentationStart, {clientId, exchangeId, profile}),
  presentationSuccess: (clientId, exchangeId) =>
    emit(presentationSuccess, {clientId, exchangeId}),
  presentationError: (clientId, exchangeId, error) =>
    emit(presentationError, {clientId, exchangeId, error}),
  callbackSuccess: (clientId, exchangeId) =>
    emit(callbackSuccess, {clientId, exchangeId}),
  legacyProtocolIdentifier: ({clientId, exchangeId, metadata}) =>
    emit(legacyProtocolIdentifier, {clientId, exchangeId, metadata})
};

export {
  callbackSuccess,
  legacyProtocolIdentifier,
  presentationError,
  presentationStart,
  presentationSuccess
};
export {rejectedIssuer} from './rejectedIssuer.js';
