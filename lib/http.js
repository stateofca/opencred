/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';
import {express} from '@bedrock/express';

import cors from 'cors';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import {
  didConfigurationDocument, didWebDocument
} from './didWeb.js';
import {
  exchangeCodeForToken, jwksEndpoint, OidcValidationMiddleware,
  openIdConfiguration
} from './oidc.js';
import {
  getExchangeStatus, initiateExchange
} from './api.js';
import {auditPresentation} from './audit.js';
import AuthenticationMiddleware from './auth.js';
import {combineTranslations} from '../configs/translation.js';
import {
  EntraVerifiedIdWorkflowService
} from './workflows/entra-verified-id-workflow.js';
import {NativeWorkflowService} from './workflows/native-workflow.js';
import {newExchangeContext} from './workflows/common.js';
import ResolveClientMiddleware from './resolveClient.js';
import {VCApiWorkflowService} from './workflows/vc-api-workflow.js';

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
  exchangeStatus: '/workflows/:workflowId/exchanges/:exchangeId'
};

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(fs.readFileSync(`${__dirname}/../package.json`));

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OpenCred',
      version: pkg.version,
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
  apis: [`${__dirname}/http.js`], // files containing annotations as above
};
const openapiSpecification = swaggerJsdoc(options);

bedrock.events.on('bedrock-express.configure.bodyParser', app => {
  app.use(express.json({limit: '200kb'}));
  app.use(
    express.urlencoded({
      limit: '200kb',
      extended: true,
    })
  );
});

bedrock.events.on('bedrock-express.configure.routes', app => {
  // Log all incoming requests and responses
  app.use((req, res, next) => {
    console.debug('=== Incoming Request ===', {
      method: req.method,
      url: req.url,
      origin: req.get('origin') || req.get('referer') || 'unknown',
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      params: req.params,
      query: req.query,
      headers: req.headers,
      body: req.body,
    });

    // Capture response (only log once per request)
    let responseSent = false;
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;

    const logResponse = data => {
      if(!responseSent) {
        responseSent = true;
        console.debug('=== Outgoing Response ===', {
          statusCode: res.statusCode,
          headers: res.getHeaders(),
          body: data
        });
      }
    };

    res.send = function(data) {
      logResponse(data);
      return originalSend.call(this, data);
    };

    res.json = function(data) {
      logResponse(data);
      return originalJson.call(this, data);
    };

    res.end = function(data) {
      logResponse(data);
      return originalEnd.call(this, data);
    };

    next();
  });

  app.use(cors());
  app.use(
    routes.apiDocs, swaggerUi.serve, swaggerUi.setup(openapiSpecification));

  app.get(routes.didWeb, didWebDocument);
  app.get(routes.didConfig, didConfigurationDocument);
  app.get(routes.jwks, jwksEndpoint);
  app.get(routes.openIdConfig, openIdConfiguration);
  app.get(routes.config, (req, res) => {
    const rp = bedrock.config.opencred.relyingParties.find(
      r => r.clientId == req.query.client_id
    );
    const {
      defaultLanguage, translations: translationsDraft, options, defaultBrand,
      customTranslateScript, audit,
      // Careful not to expose sensitive information here when pulling from
      // bedrock config!
      reCaptcha: {
        pages,
        version,
        siteKey
      }
    } = bedrock.config.opencred;
    const translations = combineTranslations(
      rp?.translations ?? {},
      translationsDraft
    );
    res.send({
      defaultLanguage,
      translations,
      options,
      brand: req.rp?.brand ?? defaultBrand,
      customTranslateScript,
      audit,
      reCaptcha: {
        pages, version, siteKey
      }
    });
  });

  // Middleware that attaches the RP configuration to the request object,
  // usually by inspecting the request for a client_id query parameter.
  ResolveClientMiddleware(app);
  AuthenticationMiddleware(app);
  OidcValidationMiddleware(app);

  /**
   * Middleware attaches exchange type-specific handlers to /context/login,
   * /exchange, /token and/or other endpoints necessary for the operation of an
   * exchange over that protocol. Each middleware function needs to call
   * `next()` if it cannot handle the request.
   */
  // NativeExchangeMiddleware(app);
  new NativeWorkflowService(app);
  new EntraVerifiedIdWorkflowService(app);
  new VCApiWorkflowService(app);
  // VCAPIExchangeMiddleware(app);
  // MicrosoftEntraVerifiedIdExchangeMiddleware(app);

  /**
   * OIDC Endpoints: GET /context/login, POST /token
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
  app.get(routes.loginContext, newExchangeContext);

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
   *                 description: The identifier of the relying party
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
  app.post(routes.token, exchangeCodeForToken);

  /**
   * Verification Endpoints: GET /context/verification
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
  app.get(routes.verificationContext, newExchangeContext);

  /**
   * HTTP API Endpoints:
   * - POST /workflows/{workflowId}/exchanges (initiate an exchange)
   * - GET /workflows/{workflowId}/exchanges/{exchangeId} (get exchange status)
   * - POST /audit-presentation (audit VP token)
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
  app.post(routes.createExchange, initiateExchange);

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
  app.get(routes.exchangeStatus, getExchangeStatus);

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
