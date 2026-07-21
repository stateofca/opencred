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
import {presentationDcApiCancelled} from './presentationDcApiCancelled.js';
import {presentationDcApiError} from './presentationDcApiError.js';
import {presentationDcApiTimeout} from './presentationDcApiTimeout.js';
import {presentationError} from './presentationError.js';
import {presentationInitiated} from './presentationInitiated.js';
import {presentationRequestServed} from './presentationRequestServed.js';
import {presentationResponseReceived} from './presentationResponseReceived.js';
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
  presentationInitiated: (clientId, exchangeId, userAgent) =>
    emit(presentationInitiated, {clientId, exchangeId, userAgent}),
  presentationStart: (clientId, exchangeId, profile, userAgent) =>
    emit(presentationStart, {clientId, exchangeId, profile, userAgent}),
  presentationRequestServed: (
    {clientId, exchangeId, profile, responseMode, wire, userAgent}) =>
    emit(presentationRequestServed,
      {clientId, exchangeId, profile, responseMode, wire, userAgent}),
  presentationResponseReceived: (clientId, exchangeId, userAgent) =>
    emit(presentationResponseReceived, {clientId, exchangeId, userAgent}),
  presentationSuccess: (clientId, exchangeId, userAgent, profile) =>
    emit(presentationSuccess, {clientId, exchangeId, profile, userAgent}),
  presentationError: (clientId, exchangeId, error, userAgent, profile) =>
    emit(presentationError, {clientId, exchangeId, error, profile, userAgent}),
  callbackSuccess: (clientId, exchangeId, userAgent) =>
    emit(callbackSuccess, {clientId, exchangeId, userAgent}),
  legacyProtocolIdentifier: ({clientId, exchangeId, metadata, userAgent}) =>
    emit(legacyProtocolIdentifier, {clientId, exchangeId, metadata, userAgent}),
  presentationDcApiCancelled: ({clientId, exchangeId, profile, userAgent}) =>
    emit(presentationDcApiCancelled,
      {clientId, exchangeId, profile, userAgent}),
  presentationDcApiError: (
    {clientId, exchangeId, profile, errorName, userAgent}) =>
    emit(presentationDcApiError,
      {clientId, exchangeId, profile, errorName, userAgent}),
  presentationDcApiTimeout: (
    {clientId, exchangeId, profile, timeoutMs, userAgent}) =>
    emit(presentationDcApiTimeout,
      {clientId, exchangeId, profile, timeoutMs, userAgent})
};

export {
  callbackSuccess,
  legacyProtocolIdentifier,
  presentationDcApiCancelled,
  presentationDcApiError,
  presentationDcApiTimeout,
  presentationError,
  presentationInitiated,
  presentationRequestServed,
  presentationResponseReceived,
  presentationStart,
  presentationSuccess
};
export {rejectedIssuer} from './rejectedIssuer.js';
