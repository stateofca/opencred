import {MongoClient} from 'mongodb';

import {config} from '../configs/config.js';

const client = new MongoClient(config.databaseConnectionUri);
const db = client.db();

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
export const exchanges = db.collection('Exchanges');
