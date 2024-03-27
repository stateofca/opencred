/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import {logger} from './logger.js';

bedrock.events.on('bedrock-mongodb.ready', async function() {
  /**
   * Exchange document structure:
  {
    id,
    sequence: 0,
    ttl: 900,
    state: 'pending', 'complete', 'invalid'
    variables: {}, // each step name in the workflow is a key in variables
    step: {string}, the name of the current step in the workflow
    challenge: {string}
    workflowId: {string}
    accessToken?: {string}
    oidc: {
      code?: string,
      state?: string,
    }
  }
  */

  /**
   * DID document history document structure:
  {
    did,
    history: {
      validFrom: Date,
      validUntil?: Date, // nullable (for most recent window)
      didDocument: {}
    }[]
  }
  // Note: History will be empty for DIDs that support versioning.
  // This helps us to know whether a given instance of OpenCred
  // has encountered an issuer DID at some point in the past.
  */
  await database.openCollections(['Exchanges', 'DidDocumentHistory']);

  await database.collections.Exchanges.createIndex(
    {recordExpiresAt: 1}, {expireAfterSeconds: 0}
  );
  logger.info('Ensured index exists: 24hr record TTL on recordExpiresAt');

  await database.collections.Exchanges.createIndex(
    {'oidc.code': 1},
    {partialFilterExpression: {'oidc.code': {$exists: true}}}
  );
  logger.info('Ensured partial index exists: oidc.code');

  await database.collections.Exchanges.createIndex({id: 1}, {unique: true});
  logger.info('Ensured exchange id index exists');

  await database.collections.DidDocumentHistory.createIndex(
    {did: 1}, {unique: true});
  logger.info('Ensured hashed index exists: DidDocumentHistory.did');
});

export {database};
