/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {callbackSuccess} from './callbackSuccess.js';
import {classifyUserAgent} from '../../../common/userAgent.js';
import {legacyProtocolIdentifier} from './legacyProtocolIdentifier.js';
import {logger} from '../../logger.js';
import {presentationError} from './presentationError.js';
import {presentationStart} from './presentationStart.js';
import {presentationSuccess} from './presentationSuccess.js';

function emit(builder, opts = {}) {
  // classified buckets only — never log the raw User-Agent string
  const {userAgent, ...fields} = opts;
  const {logName, event} = builder(fields);
  logger.info(logName, {...event, ...classifyUserAgent(userAgent)});
}

/**
 * Convenience API matching historical `common/utils.js` signatures;
 * emits at `logger.info`. The optional trailing `userAgent` is the raw
 * `User-Agent` header of the request that triggered the event; it is
 * logged only as classified `browser`/`deviceType` buckets.
 */
export const logUtils = {
  presentationStart: (clientId, exchangeId, profile, userAgent) =>
    emit(presentationStart, {clientId, exchangeId, profile, userAgent}),
  presentationSuccess: (clientId, exchangeId, userAgent) =>
    emit(presentationSuccess, {clientId, exchangeId, userAgent}),
  presentationError: (clientId, exchangeId, error, userAgent) =>
    emit(presentationError, {clientId, exchangeId, error, userAgent}),
  callbackSuccess: (clientId, exchangeId, userAgent) =>
    emit(callbackSuccess, {clientId, exchangeId, userAgent}),
  legacyProtocolIdentifier: ({clientId, exchangeId, metadata, userAgent}) =>
    emit(legacyProtocolIdentifier, {clientId, exchangeId, metadata, userAgent})
};

export {
  callbackSuccess,
  legacyProtocolIdentifier,
  presentationError,
  presentationStart,
  presentationSuccess
};
export {rejectedIssuer} from './rejectedIssuer.js';
