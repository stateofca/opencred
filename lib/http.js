/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';
import cors from 'cors';
import {dirname} from 'node:path';
import {express} from '@bedrock/express';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import {
  attachClientByQuery, attachClientByWorkflowId
} from './resolveClient.js';
import {
  didConfigurationDocument, didWebDocument
} from './didWeb.js';
import {
  exchangeCodeForToken, jwksEndpoint, openIdConfiguration,
  validateOidcLoginMiddleware
} from './oidc.js';
import {
  getConfig, getExchangeStatus, initiateExchange
} from './api.js';
import {auditPresentation} from './audit.js';
import {getAuthFunction} from './auth.js';
import {getWorkflowService} from './workflows/get-workflow-service.js';
import {newExchangeContext} from './workflows/common.js';

const routes = {
  apiDocs: '/api-docs',
  config: '/config/app.json',
  didWeb: '/.well-known/did.json',
  didConfig: '/.well-known/did-configuration.json',
  jwks: '/.well-known/jwks.json',
  openIdConfig: '/.well-known/openid-configuration',
  verificationContext: '/context/verification',
  loginContext: '/context/login',
  token: '/token',
  auditPresentation: '/audit-presentation',
  createExchange: '/workflows/:workflowId/exchanges',
  exchangeDetail: '/workflows/:workflowId/exchanges/:exchangeId',
  resetExchange: '/workflows/:workflowId/exchanges/:exchangeId/reset',
  interactions: '/interactions/:exchangeId',
  exchangeProtocols: '/workflows/:workflowId/exchanges/:exchangeId/protocols',

  // OID4VP Endpoints:
  authorizationRequest: '/workflows/:workflowId/exchanges/' +
    ':exchangeId/openid/client/authorization/request',
  authorizationResponse: '/workflows/:workflowId/exchanges/' +
    ':exchangeId/openid/client/authorization/response',

  // Entra Verified ID Endpoints:
  verificationCallback: '/verification/callback'
};

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(fs.readFileSync(`${__dirname}/../package.json`));

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OpenCred',
      version: pkg.version
    },
    components: {
      securitySchemes: {
        basic: {
          type: 'http',
          scheme: 'basic'
        },
        bearer: {
          type: 'http',
          scheme: 'bearer'
        }
      }
    }
  },
  apis: [`${__dirname}/http.js`] // files containing annotations as above
};
const openapiSpecification = swaggerJsdoc(options);

bedrock.events.on('bedrock-express.configure.bodyParser', app => {
  app.use(express.json({limit: '200kb'}));
  app.use(
    express.urlencoded({
      limit: '200kb',
      extended: true
    })
  );
});

bedrock.events.on('bedrock-express.configure.routes', app => {
  app.use(cors());
  app.use(
    routes.apiDocs, swaggerUi.serve, swaggerUi.setup(openapiSpecification));

  app.get(routes.didWeb, didWebDocument);
  app.get(routes.didConfig, didConfigurationDocument);
  app.get(routes.jwks, jwksEndpoint);
  app.get(routes.openIdConfig, openIdConfiguration);
  app.get(routes.config, getConfig);

  // Create base workflow service instance for methods that don't depend on type
  const baseWorkflowService = getWorkflowService({});

  /**
   * Middleware that dynamically selects and calls the appropriate workflow
   * service's getOrCreateExchangeMiddleware based on RP type.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next function.
   * @returns {Promise<void>} - Promise that resolves when middleware completes.
   */
  const getOrCreateExchangeMiddleware = async (req, res, next) => {
    const workflow = req.workflow;
    if(!workflow || !workflow.type) {
      return next();
    }
    const workflowService = getWorkflowService({type: workflow.type});
    return workflowService.getOrCreateExchangeMiddleware(req, res, next);
  };

  /**
   * Middleware that dynamically selects and calls the appropriate workflow
   * service's createExchangeMiddleware based on RP type.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next function.
   * @returns {Promise<void>} - Promise that resolves when middleware completes.
   */
  const createExchangeMiddleware = async (req, res, next) => {
    const workflow = req.workflow;
    if(!workflow || !workflow.type) {
      return next();
    }
    const workflowService = getWorkflowService({type: workflow.type});
    return workflowService.createExchangeMiddleware(req, res, next);
  };

  /**
   * Middleware that dynamically selects and calls the appropriate workflow
   * service's resetExchangeMiddleware based on RP type.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next function.
   * @returns {Promise<void>} - Promise that resolves when middleware completes.
   */
  const resetExchangeMiddleware = async (req, res, next) => {
    const workflow = req.workflow;
    if(!workflow || !workflow.type) {
      return next();
    }
    const workflowService = getWorkflowService({type: workflow.type});
    return workflowService.resetExchangeMiddleware(req, res, next);
  };

  /**
   * OIDC Endpoints: GET /context/login, POST /token.
   */

  /**
   * @openapi
   * /context/login:
   *   get:
   *     summary: Initiates an OIDC Login to get claims from a Verifiable
   *       credential in a wallet.
   *     tags:
   *       - OIDC
   *     operationId: OpenID Connect Login
   *     description:
   *       A client may redirect a user to this endpoint to initiate an exchange
   *       where they may present a credential from their wallet.
   *     parameters:
   *       - name: client_id
   *         description: The identifier of the relying party
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *       - name: redirect_uri
   *         description: The redirect URI to return the user to after getting
   *          their credential. (URL-encoded string.)
   *         required: true
   *         in: query
   *         schema:
   *           type: string
   *       - name: scope
   *         description: The scope of the request. Must be exactly "openid".
   *         required: true
   *         in: query
   *         schema:
   *           type: string
   *           enum: [openid]
   *       - name: state
   *         description: An opaque value used by the client to maintain state.
   *         required: false
   *         in: query
   *         schema:
   *           type: string
   *       - name: response_type
   *         description: The response type. Must be exactly "code".
   *         required: true
   *         in: query
   *         schema:
   *           type: string
   *           enum: [code]
   *     responses:
   *       "200":
   *         description: Information about the exchange.
   *         content:
   *           text/html:
   *             description: HTML page with QR code and CHAPI button.
   *       "400":
   *         description: Request is malformed.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *       "500":
   *         description: Internal server error.
   */
  app.get(routes.loginContext,
    attachClientByQuery,
    validateOidcLoginMiddleware,
    getOrCreateExchangeMiddleware,
    newExchangeContext
  );

  /**
   * @openapi
   * /token:
   *   post:
   *     summary: Completes an OIDC login flow by exchanging code for id_token.
   *     tags:
   *       - OIDC
   *     operationId: OpenID Connect Token
   *     description:
   *       A client can use this endpoint to get VC-based user info from a
   *       wallet after the user has completed the wallet exchange and returned
   *       to the client with a code.
   *     requestBody:
   *       content:
   *         'application/x-www-form-urlencoded':
   *           schema:
   *             type: object
   *             properties:
   *               client_id:
   *                 description: The identifier of the workflow
   *                 type: string
   *                 required: true
   *               client_secret:
   *                 description: The secret of the relying party
   *                 type: string
   *                 required: true
   *               code:
   *                 description: A random code that identifies this transaction
   *                 type: string
   *                 required: true
   *               grant_type:
   *                 description: Grant type must be "authorization_code".
   *                 type: string
   *                 required: true
   *                 enum: [authorization_code]
   *     responses:
   *       "200":
   *         description: An access token response. access_token is not usable,
   *           but the id_token contains claims about the user.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 access_token:
   *                   description: Not used, but present for OAuth2 compliance.
   *                   type: string
   *                 id_token:
   *                   description: A signed JWT with claims about the user.
   *                   type: string
   *                 expires_in:
   *                   description: not used, but present for OAuth2 compliance.
   *                   type: number
   *                 token_type:
   *                   description: Always "Bearer", access token is not used.
   *                   type: string
   *       "400":
   *         description: Request is malformed.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *       "500":
   *         description: Internal server error.
   */
  app.post(routes.token,
    getAuthFunction({basic: true, bearer: false, body: true}),
    exchangeCodeForToken
  );

  /**
   * Verification Endpoints: GET /context/verification.
   */

  /**
   * @openapi
   * /context/verification:
   *   get:
   *     summary: Initiates a verification exchange for a Verifiable
   *       credential in a wallet.
   *     operationId: OpenID Connect Login
   *     description:
   *       A client may redirect a user to this endpoint to initiate an exchange
   *       where they may present a credential from their wallet.
   *     parameters:
   *       - name: client_id
   *         description: The identifier of the relying party
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *       - name: redirect_uri
   *         description: The redirect URI to return the user to after getting
   *          their credential. (URL-encoded string.)
   *         required: true
   *         in: query
   *         schema:
   *           type: string
   *       - name: scope
   *         description: The scope of the request. Must be exactly "openid".
   *         required: true
   *         in: query
   *         schema:
   *           type: string
   *           enum: [openid]
   *       - name: state
   *         description: An opaque value used by the client to maintain state.
   *         required: false
   *         in: query
   *         schema:
   *           type: string
   *       - name: response_type
   *         description: The response type. Must be exactly "code".
   *         required: true
   *         in: query
   *         schema:
   *           type: string
   *           enum: [code]
   *     responses:
   *       "200":
   *         description: Information about the exchange.
   *         content:
   *           text/html:
   *             description: HTML page with QR code and CHAPI button.
   *       "400":
   *         description: Request is malformed.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *       "500":
   *         description: Internal server error.
   */
  app.get(routes.verificationContext,
    attachClientByQuery,
    getOrCreateExchangeMiddleware,
    newExchangeContext
  );

  /**
   * VC API / VCALM HTTP API Endpoints:
   * - POST /workflows/{workflowId}/exchanges (initiate an exchange)
   * - GET /workflows/{workflowId}/exchanges/{exchangeId} (get exchange status)
   * - POST /audit-presentation (audit VP token)
   * - GET /interactions/:exchangeId (interaction URL)
   * - GET /workflows/:workflowId/exchanges/:exchangeId/protocols (protocols).
   */

  /**
   * @openapi
   * /workflows/{workflowId}/exchanges:
   *   post:
   *    summary: Initiates an exchange.
   *    tags:
   *     - Exchanges
   *    security:
   *     - basic: []
   *    operationId: initiateExchange
   *    description:
   *      A client can use this endpoint to initiate an exchange of a particular
   *      workflow.
   *    parameters:
   *      - name: workflowId
   *        description: An identifier for a workflow.
   *        in: path
   *        required: true
   *        schema:
   *          type: string
   *          minimum: 3
   *          pattern: "^[a-zA-Z0-9-]+$"
   *    responses:
   *      "200":
   *        description: Information about the exchange.
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *               exchangeId:
   *                type: string
   *               OID4VP:
   *                type: string
   *               QR:
   *                type: string
   *               vcapi:
   *                type: string
   *      "400":
   *        description: Request is malformed.
   *        content:
   *          application/json:
   *            schema:
   *             type: object
   *             properties:
   *              message:
   *               type: string
   *      "500":
   *        description: Internal server error.
   */
  app.post(routes.createExchange,
    attachClientByWorkflowId,
    getAuthFunction({basic: true, bearer: true, body: false}),
    createExchangeMiddleware,
    initiateExchange
  );

  /**
   * @openapi
   * /workflows/{workflowId}/exchanges/{exchangeId}:
   *   get:
   *    summary: Retrieves an exchange.
   *    tags:
   *     - Exchanges
   *    security:
   *     - bearer: []
   *    operationId: getExchange
   *    description:
   *      A client can use this endpoint to retrieve the state and relevant data
   *      of an exchange of a particular workflow.
   *    parameters:
   *      - name: workflowId
   *        description: An identifier for a workflow.
   *        in: path
   *        required: true
   *        schema:
   *          type: string
   *          minimum: 3
   *          pattern: "^[a-zA-Z0-9-]+$"
   *      - name: exchangeId
   *        description: An identifier for an exchange.
   *        in: path
   *        required: true
   *        schema:
   *          type: string
   *          minimum: 3
   *          pattern: "^[a-zA-Z0-9-]+$"
   *    responses:
   *      "200":
   *        description: Information about the exchange.
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *               exchange:
   *                type: object
   *      "400":
   *        description: Request is malformed.
   *        content:
   *          application/json:
   *            schema:
   *             type: object
   *             properties:
   *              message:
   *               type: string
   *      "500":
   *        description: Internal server error.
   */
  app.get(routes.exchangeDetail,
    attachClientByWorkflowId,
    getAuthFunction({basic: true, bearer: true, body: false}),
    baseWorkflowService.getExchangeMiddleware.bind(baseWorkflowService),
    getExchangeStatus
  );

  // POST /workflows/:workflowId/exchanges/:exchangeId (submit presentation)
  app.post(routes.exchangeDetail,
    attachClientByWorkflowId,
    baseWorkflowService.createGetExchangeMiddleware({allowExpired: false}),
    getWorkflowService({type: 'native'}).
      participateInExchangeMiddleware.bind(
        getWorkflowService({type: 'native'}))
  );

  // POST /workflows/:workflowId/exchanges/:exchangeId/reset
  app.post(routes.resetExchange,
    attachClientByWorkflowId,
    getAuthFunction({basic: true, bearer: true, body: false}),
    baseWorkflowService.getExchangeMiddleware.bind(baseWorkflowService),
    resetExchangeMiddleware
  );

  // GET /interactions/:exchangeId and
  // GET /workflows/:workflowId/exchanges/:exchangeId/protocols
  // Public endpoint to get protocol URLs for an exchange
  const getProtocols = async (req, res) => {
    const exchange = req.exchange;
    if(!exchange) {
      res.status(404).send({message: 'Exchange not found'});
      return;
    }

    // Look up workflow from exchange workflowId if not already set
    let workflow = req.workflow;
    if(!workflow && exchange.workflowId) {
      workflow = bedrock.config.opencred.workflows?.find(
        w => w.clientId === exchange.workflowId
      );
    }
    if(!workflow) {
      res.status(404).send({message: 'Workflow not found'});
      return;
    }

    const workflowService = getWorkflowService({type: workflow.type});
    const protocols = workflowService.getProtocols({exchange});

    res.send({protocols});
  };

  app.get(routes.interactions,
    baseWorkflowService.getExchangeMiddleware.bind(baseWorkflowService),
    getProtocols
  );

  app.get(routes.exchangeProtocols,
    attachClientByWorkflowId,
    baseWorkflowService.getExchangeMiddleware.bind(baseWorkflowService),
    getProtocols
  );

  /* OID4VP Endpoints:
  - GET /workflows/:workflowId/exchanges/:exchangeId/openid
      /client/authorization/request
  - POST /workflows/:workflowId/exchanges/:exchangeId/openid
      /client/authorization/response
  */
  // GET /workflows/:workflowId/
  //  exchanges/:exchangeId/openid/client/
  app.get(routes.authorizationRequest,
    attachClientByWorkflowId,
    baseWorkflowService.getExchangeMiddleware.bind(baseWorkflowService),
    getWorkflowService({type: 'native'}).
      authorizationRequestMiddleware.bind(
        getWorkflowService({type: 'native'}))
  );

  // POST /workflows/:workflowId/
  //   exchanges/:exchangeId/openid/client/authorization/response
  app.post(routes.authorizationResponse,
    attachClientByWorkflowId,
    baseWorkflowService.getExchangeMiddleware.bind(baseWorkflowService),
    getWorkflowService({type: 'native'}).
      authorizationResponseMiddleware.bind(
        getWorkflowService({type: 'native'}))
  );

  /* Entra Verified ID Endpoint: */
  // POST /verification/callback
  app.post(routes.verificationCallback,
    getWorkflowService({type: 'microsoft-entra-verified-id'}).
      verificationCallbackMiddleware.bind(
        getWorkflowService({type: 'microsoft-entra-verified-id'}))
  );

  /**
   * @openapi
   * /audit-presentation:
   *   post:
   *    summary: Audits presentation presented in the past.
   *    tags:
   *     - Audit
   *    security:
   *     - basic: []
   *    operationId: auditPresentation
   *    description:
   *      A client can use this endpoint to audit a presentation
   *      presented in the past.
   *    requestBody:
   *      content:
   *        'application/json':
   *          schema:
   *            oneOf:
   *              - type: object
   *                properties:
   *                  vpToken:
   *                    description: A VP token in JWT format
   *                    type: string
   *                    required: true
   *                  fields:
   *                    description: A mapping from VP token paths to
   *                      expected values submitted by the user
   *                    type: object
   *                    required: false
   *                  reCaptchaToken:
   *                    description: A reCAPTCHA token
   *                    type: string
   *                    required: false
   *              - type: object
   *                properties:
   *                  vpToken:
   *                    description: A VP token in Data Integrity format
   *                    type: object
   *                    required: true
   *                  fields:
   *                    description: A mapping from VP token paths to
   *                      expected values submitted by the user
   *                    type: object
   *                    required: false
   *                  reCaptchaToken:
   *                    description: A reCAPTCHA token
   *                    type: string
   *                    required: false
   *    responses:
   *      "200":
   *        description: Success.
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                verified:
   *                  type: boolean
   *                matches:
   *                  type: object
   *                message:
   *                  type: string
   *      "400":
   *        description: Faulty audit request.
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                verified:
   *                  type: boolean
   *                matches:
   *                  type: object
   *                message:
   *                  type: string
   *      "500":
   *        description: Unknown error.
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                verified:
   *                  type: boolean
   *                matches:
   *                  type: object
   *                message:
   *                  type: string
   *      "501":
   *        description: Unsupported audit feature.
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                verified:
   *                  type: boolean
   *                matches:
   *                  type: object
   *                message:
   *                  type: string
   */
  app.post(routes.auditPresentation, auditPresentation);
});
