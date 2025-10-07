/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2025 Spruce Systems, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createId, logUtils} from '../../common/utils.js';
import {DcApi, JsOid4VpSessionStore} from '@spruceid/opencred-dc-api';
import {BaseWorkflowService} from './base.js';
import {config} from '@bedrock/core';
import {database} from '../database.js';
import {logger} from '../logger.js';

const WORKFLOW_TYPE = 'dc-api';

const AUTHORIZATION_REQUEST_ENDPOINT =
  '/workflows/:workflowId/exchanges/:exchangeId/dc-api/request';

const AUTHORIZATION_RESPONSE_ENDPOINT =
  '/workflows/:workflowId/exchanges/:exchangeId/dc-api/response';

export class DCApiWorkflowService extends BaseWorkflowService {
  // /** @type {DcApi} */
  // dcApi;

  constructor(app) {
    super(app);

    app.get(
      AUTHORIZATION_REQUEST_ENDPOINT,
      this.authorizationRequest.bind(this),
    );
    app.post(
      AUTHORIZATION_RESPONSE_ENDPOINT,
      this.authorizationResponse.bind(this),
    );

    // Set the DC API Instance
    this.initDcApi().then(dcApi => {
      this.dcApi = dcApi;
    });
  }

  async initDcApi() {
    const rp = config.opencred.relyingParties.find(
      rp => rp.workflow.type === 'dc-api',
    );

    const sk = config.opencred.signingKeys.find(k =>
      k.purpose?.includes('authorization_request'),
    );

    const encoder = new TextEncoder();
    const submissionEndpoint = rp.workflow.submissionEndpoint || '';
    const referenceEndpoint = rp.workflow.referenceEndpoint || '';

    const oid4vpSessionStore = new JsOid4VpSessionStore({
      async initiate(session) {
        // NOTE: creating a new exchange for the oid4vp session
        // within this callback function versus
        // `createWorkflowSpecificExchange` method given constraints
        // in how the session is managed internally. Rather than using
        // the dc-api exchange created during the
        // `createWorkflowSpecificExchange` execution, this oid4vp
        // session store creates a secondary exchange, managed exclusively
        // within these callbacks. The variables object provides the
        // main details of the session under the `oid4vpSession`, while the
        // other fields are provided to maintain compatbility
        // with the existing `Exchange` database model.
        try {
          const duration = config.opencred.options.recordExpiresDurationMs;
          const ttl = 1000 * config.opencred.options.exchangeTtlSeconds;
          const gracePeriod = 1000 * 60;
          const createdAt = new Date();

          await database.collections.Exchanges.insertOne({
            id: await createId(),
            challenge: await createId(),
            workflowId: '',
            state: 'pending',
            sequence: 0,
            step: 'initiated',
            ttl,
            createdAt,
            recordExpiresAt: new Date(
              createdAt.getTime() + Math.max(ttl + gracePeriod, duration),
            ),
            variables: {
              oid4vpSession: session,
            },
            oidc: '',
            accessToken: '',
          });
        } catch(e) {
          console.error('Failed to create exchange:', e);
        }
      },
      async updateStatus(uuid, status) {
        await database.collections.Exchanges.updateOne(
          {
            'variables.oid4vpSession.uuid': uuid,
          },
          {$set: {'variables.oid4vpSession.status': status}},
        );
      },
      async getSession(uuid) {
        const exchange = await database.collections.Exchanges.findOne(
          {'variables.oid4vpSession.uuid': uuid},
          {projection: {_id: 0, variables: 1}},
        );

        if(!exchange || !exchange.variables.oid4vpSession) {
          throw new Error(`OID4VP Session not found for UUID: ${uuid}`);
        }

        return exchange.variables.oid4vpSession;
      },
      async removeSession(uuid) {
        await database.collections.Exchanges.deleteOne({
          'variables.oid4vpSession.uuid': uuid,
        });
      },
    });

    // const dcApi = new DcApi();
    const dcApi = await DcApi.new(
      sk.privateKeyPem,
      rp?.workflow?.baseUrl,
      submissionEndpoint,
      referenceEndpoint,
      encoder.encode(config.opencred.caStore[0]),
      // JsOid4VpSessionStore.createMemoryStore(),
      oid4vpSessionStore,
      // DC API Session
      {
        newSession: async (/* sessionId, session */) => {
          // NOTE: This callback is handled within the
          // `createWorkflowSpecificExchange` when `create_new_session`
          // is called. The session is stored directly within the exchange.
        },
        getSession: async (id /*, clientSecret*/) => {
          console.log(`Fetching DC API session for ID: ${id}`);
          const exchange = await database.collections.Exchanges.findOne(
            {'variables.dcApiSession.session_creation_response.id': id},
            {projection: {_id: 0, variables: 1}},
          );
          return exchange?.variables?.dcApiSession.session || null;
        },
        getSessionUnauthenticated: async id => {
          console.log(`Fetching unauthenticated DC API session for ID: ${id}`);
          // return this.dcApiSessionCache.get(id) || null;
          const exchange = await database.collections.Exchanges.findOne(
            {'variables.dcApiSession.session_creation_response.id': id},
            {projection: {_id: 0, variables: 1}},
          );
          return exchange?.variables?.dcApiSession.session || null;
        },
        updateSession: async (sessionId, session) => {
          console.log(`Updating DC API session for ID: ${sessionId}`);
          await database.collections.Exchanges.updateOne(
            {
              'variables.dcApiSession.session_creation_response.id': sessionId,
            },
            {$set: {'variables.dcApiSession.session': session}},
          );
        },
        removeSession: async sessionId => {
          await database.collections.Exchanges.deleteOne({
            'variables.dcApiSession.session_creation_response.id': sessionId,
          });
        },
      },
    );

    return dcApi;
  }

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    if(trustedVariables.rp?.workflow?.type !== WORKFLOW_TYPE) {
      return;
    }

    const dcApiSession = await this.dcApi.create_new_session();

    const ex = await this.initExchange(trustedVariables, untrustedVariables);
    if(!ex.workflowId) {
      ex.workflowId = trustedVariables.rp.workflow.id;
    }

    ex.variables = {
      dcApiSession,
    };

    await database.collections.Exchanges.insertOne(ex);

    return this.formatExchange(ex);
  }

  async authorizationRequest(req, res) {
    const rp = req.rp;
    const exchange = await this.getExchange({rp, id: req.params.exchangeId});

    logUtils.presentationStart(rp?.clientId, exchange?.id);
    if(!exchange || exchange?.workflowId !== req.params.workflowId) {
      const errorMessage = 'Exchange not found';
      logUtils.presentationError(rp?.clientId, 'unknown', errorMessage);
      res.status(404).send({message: errorMessage});
      return;
    }
    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
      res.status(400).send(errorMessage);
      return;
    }
    try {
      const sessionId =
        exchange.variables.dcApiSession.session_creation_response.id;
      const sessionSecret =
        exchange.variables.dcApiSession.session_creation_response.client_secret;

      if(!sessionSecret || !sessionId) {
        res.status(500).send({message: 'Session data missing from exchange'});
        return;
      }

      const requests = await this.dcApi.initiate_request(
        sessionId,
        sessionSecret,
        JSON.parse(rp.workflow.dcApiRequest),
        req.headers['user-agent'],
      );

      await database.collections.Exchanges.updateOne(
        {id: exchange.id},
        {
          $set: {state: 'active'},
        },
      );

      res.send(requests);
    } catch(error) {
      logUtils.presentationError(rp?.clientId, exchange.id, error.message);
      logger.error(error.message, {error});
      res.sendStatus(500);
    }
    return;
  }

  async authorizationResponse(req, res) {
    try {
      const rp = req.rp;

      const exchange = await this.getExchange({
        rp,
        id: req.params.exchangeId,
      });

      if(!exchange || exchange?.workflowId !== req.params.workflowId) {
        const errorMessage = 'Exchange not found';
        logUtils.presentationError(rp?.clientId, 'unknown', errorMessage);
        res.status(404).send({message: errorMessage});
        return;
      }

      if(exchange.state !== 'active') {
        const errorMessage = `Exchange in state ${exchange.state}`;
        logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
        res.status(400).send(errorMessage);
        return;
      }

      const results = await this.dcApi.submit_response(
        exchange.variables.dcApiSession.session_creation_response.id,
        exchange.variables.dcApiSession.session_creation_response.client_secret,
        req.body,
      );

      // Generate OIDC authorization code for Keycloak/OAuth flows
      const oidcCode = await createId();

      await database.collections.Exchanges.updateOne(
        {id: exchange.id},
        {
          $set: {
            state: 'complete',
            step: 'verification',
            'oidc.code': oidcCode,
            variables: {
              ...exchange.variables,
              dcApiResponse: results,
              results: {
                verification: results,
              },
            },
          },
        },
      );

      // Get the updated exchange to return to frontend with OIDC code
      const updatedExchange = await database.collections.Exchanges.findOne({
        id: exchange.id,
      });

      // Send callback to relying party if configured
      if(rp.workflow.callback) {
        const {sendCallback} = await import('../callback.js');
        const callbackSuccess = await sendCallback(
          rp.workflow,
          updatedExchange,
          'verification',
        );
        if(!callbackSuccess) {
          logger.warn('Failed to send callback to relying party');
        }
      }

      // Return both results and updated exchange with OIDC code
      res.send({
        ...results,
        exchange: {
          id: updatedExchange.id,
          oidc: updatedExchange.oidc,
          state: updatedExchange.state,
        },
      });
    } catch(error) {
      logger.error(error.message, {error});
      res.sendStatus(500);
    }
  }
}
