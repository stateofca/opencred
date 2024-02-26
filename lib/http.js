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
  exchangeCodeForToken, jwksEndpoint, loginContext, OidcValidationMiddleware,
  openIdConfiguration
} from './oidc.js';
import {
  getExchangeStatus, initiateExchange
} from './api.js';
import AuthenticationMiddleware from './auth.js';
// import {exchanges} from '../lib/database.js';
import MicrosoftEntraVerifiedIdExchangeMiddleware
  from './exchanges/microsoft-entra-verified-id.js';
import NativeExchangeMiddleware from './exchanges/native.js';
import ResolveClientMiddleware from './resolveClient.js';
import VCAPIExchangeMiddleware from './exchanges/vc-api.js';

const routes = {
  apiDocs: '/api-docs',
  assets: '/assets',
  config: '/config/app.json',
  didWeb: '/.well-known/did.json',
  didConfig: '/.well-known/did-configuration.json',
  jwks: '/.well-known/jwks.json',
  openIdConfig: '/.well-known/openid-configuration',
  loginContext: '/context/login',
  token: '/token',
  createExchange: '/workflows/:workflowId/exchanges',
  exchangeStatus: '/workflows/:workflowId/exchanges/:exchangeId',

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
  app.use(cors());
  app.get(routes.config, (req, res) => {
    const {
      defaultLanguage, translations, options, defaultTheme
    } = bedrock.config.opencred;
    res.send({defaultLanguage, translations, options, defaultTheme});
  });
  app.use(
    routes.apiDocs, swaggerUi.serve, swaggerUi.setup(openapiSpecification));

  app.get(routes.didWeb, didWebDocument);
  app.get(routes.didConfig, didConfigurationDocument);
  app.get(routes.jwks, jwksEndpoint);
  app.get(routes.openIdConfig, openIdConfiguration);

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
  NativeExchangeMiddleware(app);
  VCAPIExchangeMiddleware(app);
  MicrosoftEntraVerifiedIdExchangeMiddleware(app);

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
  app.get(routes.loginContext, loginContext);

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
   * HTTP API Endpoints:
   * - POST /workflows/{workflowId}/exchanges (initiate an exchange)
   * - GET /workflows/{workflowId}/exchanges/{exchangeId} (get exchange status)
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
});

