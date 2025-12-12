/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  authorizationRequestForProfile,
  authorizationResponseForProfile
} from './profiles/oid4vp.js';
import {
  getVerifiablePresentationRequest,
  handleVerifiablePresentation
} from './profiles/native-vcapi.js';
import {
  importPKCS8, SignJWT
} from 'jose';
import {BaseWorkflowService} from './base.js';
import {config} from '@bedrock/core';
import {database} from '../database.js';
import {domainToDidWeb} from '../didWeb.js';
import {handleVerifiedPresentation} from './common.js';
import {identifyProfile} from './profiles/identifyProfile.js';
import {logger} from '../logger.js';
import {
  logUtils
} from '../../common/utils.js';
import {sendCallback} from '../callback.js';

export class NativeWorkflowService extends BaseWorkflowService {

  async getExchange(
    {id, accessToken, allowExpired} = {allowExpired: false}
  ) {
    const exchange = await super.getExchange({id, accessToken, allowExpired});
    if(!exchange) {
      return null;
    }

    // Scrub DC API session data from exchange (server-side only)
    if(exchange.variables?.dcApiSession) {
      // eslint-disable-next-line no-unused-vars
      const {dcApiSession, ...restVariables} = exchange.variables;
      exchange.variables = restVariables;
    }

    return exchange;
  }

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    if(trustedVariables.workflow?.type !== 'native') {
      return;
    }

    const ex = await this.initExchange(trustedVariables, untrustedVariables);
    await database.collections.Exchanges.insertOne(ex);
    return this.formatExchange(ex, {workflow: trustedVariables.workflow});
  }

  getProtocols({exchange}) {
    const domain = config.server.baseUri;
    const {id, workflowId} = exchange;
    const baseUrl = `${domain}/workflows/${workflowId}/exchanges/${id}`;
    const authzReqUrl = `${baseUrl}/openid/client/authorization/request`;
    const clientId = domainToDidWeb(domain);

    const buildOpenId4VpUrl = profile => {
      const requestUri = profile ?
        `${authzReqUrl}?profile=${profile}` : authzReqUrl;
      const searchParams = new URLSearchParams({
        client_id: clientId,
        request_uri: requestUri
      });
      return 'openid4vp://?' + searchParams.toString();
    };

    const protocols = {
      ...super.getProtocols({exchange}),
      vcapi: baseUrl,
      OID4VP: buildOpenId4VpUrl('OID4VP-combined'),
      'OID4VP-draft18': buildOpenId4VpUrl('OID4VP-draft18'),
      'OID4VP-1.0': buildOpenId4VpUrl('OID4VP-1.0')
    };

    // Add 18013-7-Annex-D protocol if workflow query includes mso_mdoc format
    if(workflowId) {
      const workflow = config.opencred.workflows?.find(
        w => w.clientId === workflowId
      );
      if(workflow?.query) {
        // Check if any query item has mso_mdoc in its format array
        const hasMsoMdoc = workflow.query.some(item => {
          const formats = item.format || [];
          return Array.isArray(formats) && formats.includes('mso_mdoc');
        });
        if(hasMsoMdoc) {
          protocols['18013-7-Annex-D'] = buildOpenId4VpUrl('18013-7-Annex-D');
        }
      }
    }

    return protocols;
  }

  async participateInExchangeMiddleware(req, res, next) {
    const workflow = req.workflow;
    if(workflow?.type !== 'native') {
      next();
      return;
    }
    if(workflow.clientId !== req.params.workflowId) {
      res.status(400).send({message: 'Incorrect workflowId'});
      return;
    }

    const exchange = req.exchange;
    if(!exchange) {
      res.sendStatus(404);
      return;
    }

    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      const errorMessage = `Participation disallowed: Exchange in state ${
        exchange.state}`;
      logUtils.presentationError(workflow?.clientId, exchange.id, errorMessage);
      res.status(400).send({message: errorMessage});
      return;
    }

    try {
      if(!req.body.verifiablePresentation) {
        // Case 1: Empty body or {} - return verifiablePresentationRequest
        const domain = config.server.baseUri;
        const url = req.url;
        const vpr = await getVerifiablePresentationRequest({
          workflow, exchange, domain, url
        });
        res.send({
          verifiablePresentationRequest: vpr
        });
        return;
      }

      // Case 2: Verify presentation
      // Extract verifiablePresentation from body (may be JSON string or object)
      // Note: only LDP VPs are supported for now - JWTs must be submitted as
      // EnvelopedVerifiablePresentations etc.
      let vpToken = req.body.verifiablePresentation;
      if(typeof vpToken === 'string') {
        try {
          vpToken = JSON.parse(vpToken);
        } catch(error) {
          // If parsing fails, return 400 error
          res.status(400).send({
            title: 'PARSING_ERROR',
            detail: 'Could not parse verifiablePresentation. JSON expected.'
          });
          return;
        }
      }

      const {
        verified, errors: allErrors, verifiablePresentation
      } = await handleVerifiablePresentation({
        workflow, exchange, vpToken
      });

      if(verified) {
        // Success: update exchange and send callback
        const updatedExchange = await handleVerifiedPresentation({
          exchange,
          verifiablePresentation,
          vpToken: req.body.verifiablePresentation
        });
        await this.processCallback({
          workflow,
          updatedExchange
        });
        // Respond with 200 OK and {} body (not redirect_uri)
        res.status(200).send({});
        return;
      }

      // Failed verification: update exchange to invalid state
      const updatedExchange = {
        ...exchange,
        updatedAt: new Date(),
        state: 'invalid',
        variables: {
          ...exchange.variables,
          results: {[exchange.step]: {errors: allErrors}}
        }
      };
      await database.collections.Exchanges.replaceOne({
        id: exchange.id
      }, updatedExchange);
      logUtils.presentationError(workflow?.clientId, exchange.id,
        allErrors.join(', '));
      res.status(400).send({errors: allErrors});
      return;
    } catch(error) {
      // TODO update exchange with errors and state: invalid.
      logger.error(error.message, {error});
      logUtils.presentationError(
        workflow?.clientId, req.exchange?.id, error.message);
      res.sendStatus(500);
      return;
    }
  }

  /**
   * Processes the callback for a verified submission
   * @param {object} options
   * @param {object} options.workflow - The workflow config
   * @param {object} options.updatedExchange - The updated exchange object
   * @returns {Promise<object>} Object with success flag and response data
   */
  async processCallback({workflow, updatedExchange}) {
    const callbackSuccess = await sendCallback(workflow, updatedExchange);
    if(!callbackSuccess) {
      const errorMessage = 'Callback failed to send.';
      updatedExchange.state = 'invalid';
      const step = updatedExchange.step;
      if(updatedExchange.variables?.results &&
          updatedExchange.variables.results?.[step] === undefined) {
        updatedExchange.variables.results[step] = {};
      }
      updatedExchange.variables.results[step].errors = [errorMessage];
      await database.collections.Exchanges.replaceOne({
        id: updatedExchange.id
      }, updatedExchange);
      logUtils.presentationError(
        workflow?.clientId, updatedExchange.id, errorMessage);
      return {success: false, statusCode: 204};
    }
    logUtils.presentationSuccess(workflow?.clientId, updatedExchange.id);

    // Update exchange into complete state
    await database.collections.Exchanges.replaceOne({
      id: updatedExchange.id
    }, updatedExchange);

    // TODO: we need to remove the setting of redirectPath in the variables
    // with replaceExchange and handle the use case without replacing exchange.
    // The need is to send the wallet back to the opencred page but only if the
    // user engaged in a same-device flow.
    if(updatedExchange.variables.redirectPath) {
      const redirect_uri =
        `${config.server.baseUri}${updatedExchange.variables.redirectPath}`;
      return {success: true, statusCode: 200, redirect_uri};
    }
    return {success: true, statusCode: 204};
  }

  /**
   * Serves the authorization request for the OpenID4VP protocol
   */
  async authorizationRequestMiddleware(req, res, next) {
    const {exchange, workflow} = req;
    if(workflow?.type !== 'native') {
      next();
      return;
    }

    if(!exchange || exchange?.workflowId !== req.params.workflowId) {
      const errorMessage = 'Exchange not found';
      logUtils.presentationError(workflow?.clientId, 'unknown', errorMessage);
      res.status(404).send({message: errorMessage});
      return;
    }
    logUtils.presentationStart(workflow?.clientId, exchange?.id);

    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(workflow?.clientId, exchange.id, errorMessage);
      res.status(400).send(errorMessage);
      return;
    }

    try {
      // Step 1: Identify profile and response mode
      const {profile, responseMode, clientIdScheme} = identifyProfile({
        profile: req.query.profile,
        responseMode: req.query.response_mode,
        clientIdScheme: req.query.client_id_scheme,
        workflow
      });

      // Step 2: Generate authorization request using profile-specific handler
      const result = await authorizationRequestForProfile({
        profile,
        responseMode,
        clientIdScheme,
        workflow,
        exchange,
        requestUrl: req.originalUrl,
        userAgent: req.headers['user-agent']
      });

      const {authorizationRequest, authorizationRequestJwt,
        updatedExchange, signingMetadata} = result;

      // Handle SpruceID special case (returns JWT string directly)
      // If authorizationRequestJwt already exists, return it immediately
      if(authorizationRequestJwt) {
        res.set('Content-Type', 'application/oauth-authz-req+jwt');
        res.send(authorizationRequestJwt);
        // Persist exchange (database update moved here from spruceid handler)
        await database.collections.Exchanges.replaceOne(
          {id: exchange.id},
          updatedExchange
        );
        return;
      }

      // Step 3: Sign JWT
      const signingKey = config.opencred.signingKeys
        .find(k => k.purpose?.includes('authorization_request'));
      if(!signingKey) {
        logger.error('No key with purpose authorization_request found');
        res.sendStatus(500);
        return;
      }

      const privateKey = await importPKCS8(
        signingKey.privateKeyPem, signingKey.type);

      // Use signing metadata if provided (for Annex-D handlers),
      // otherwise use defaults
      const protectedHeader = signingMetadata ? {
        alg: signingMetadata.alg,
        kid: signingMetadata.kid,
        typ: 'oauth-authz-req+jwt',
        ...(signingMetadata.x5c && signingMetadata.x5c.length > 0 ?
          {x5c: signingMetadata.x5c} :
          {})
      } : {
        alg: signingKey.type,
        kid: `${domainToDidWeb(config.server.baseUri)}#${signingKey.id}`,
        typ: 'JWT'
      };

      const jwt = await new SignJWT(authorizationRequest)
        .setProtectedHeader(protectedHeader)
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(privateKey);

      // Step 4: Persist exchange
      await database.collections.Exchanges.replaceOne(
        {id: exchange.id},
        updatedExchange
      );

      // Step 5: Return response
      res.set('Content-Type', 'application/oauth-authz-req+jwt');
      res.send(jwt);
    } catch(error) {
      logUtils.presentationError(
        workflow?.clientId, exchange.id, error.message);
      logger.error(error.message, {error});
      res.sendStatus(500);
    }
    return;
  }

  async authorizationResponseMiddleware(req, res, next) {
    const workflow = req.workflow;
    if(workflow?.type !== 'native') {
      next();
      return;
    }
    const exchange = req.exchange;
    if(!exchange) {
      logUtils.presentationError(
        workflow?.clientId, 'unknown', 'Exchange not found');
      res.sendStatus(404);
      return;
    }
    if(exchange.state !== 'pending' && exchange.state !== 'active') {
      await database.collections.Exchanges.updateOne({
        id: exchange.id
      }, {$set: {state: 'invalid', updatedAt: new Date()}});
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(workflow?.clientId, exchange.id, errorMessage);
      res.status(400).send(errorMessage);
      return;
    }
    try {
      // Step 1: Call profile-specific handler
      // Handler selection is now internal to authorizationResponseForProfile
      const responseUrl = `${config.server.baseUri}${req.originalUrl}`;
      const {updatedExchange} = await authorizationResponseForProfile({
        workflow,
        exchange,
        responseUrl,
        responseBody: req.body
      });

      // Step 3: Persist exchange to database
      await database.collections.Exchanges.replaceOne(
        {id: exchange.id},
        updatedExchange
      );
      // Step 4: Handle callback processing
      const callbackResult = await this.processCallback({
        workflow,
        updatedExchange
      });

      // Step 5: Return response based on callback result
      if(callbackResult.redirect_uri) {
        res.send({
          redirect_uri: callbackResult.redirect_uri,
          exchange: {
            id: updatedExchange.id,
            oidc: updatedExchange.oidc,
            state: updatedExchange.state
          }
        });
        return;
      }
      res.status(callbackResult.statusCode || 204).send();
      return;
    } catch(error) {
      const errorMessage = error.message || 'Unknown error';
      logUtils.presentationError(
        workflow?.clientId, exchange.id, errorMessage);

      // Handle verification errors with errors array
      if(error.errors && Array.isArray(error.errors)) {
        const failedExchange = {
          ...exchange,
          updatedAt: new Date(),
          state: 'invalid',
          variables: {
            ...exchange.variables,
            results: {[exchange.step]: {errors: error.errors}}
          }
        };
        await database.collections.Exchanges.replaceOne({
          id: exchange.id
        }, failedExchange);
        res.status(400).send({errors: error.errors});
        return;
      }

      const statusCode = error.statusCode || 500;
      const errorCode = error.errorCode || 'INTERNAL_ERROR';
      res.status(statusCode).send({
        message: errorMessage,
        error: errorCode
      });
      return;
    }
  }

}
