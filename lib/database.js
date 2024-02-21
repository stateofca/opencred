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
  await database.openCollections(['Exchanges']);

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
});

export {database};
