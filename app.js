import cors from 'cors';
import {dirname} from 'node:path';
import express from 'express';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import {
  didConfigurationDocument, didWebDocument
} from './controllers/didWeb.js';
import {
  exchangeCodeForToken, jwksEndpoint, login, OidcValidationMiddleware,
  openIdConfiguration
} from './controllers/oidc.js';
import {
  getExchangeStatus, initiateExchange
} from './controllers/api.js';
import AuthenticationMiddleware from './controllers/auth.js';
import {exchanges} from './common/database.js';
import {health} from './controllers/health.js';
import MicrosoftEntraVerifiedIdExchangeMiddleware
  from './controllers/exchanges/microsoft-entra-verified-id.js';
import NativeExchangeMiddleware from './controllers/exchanges/native.js';
import ResolveClientMiddleware from './controllers/resolveClient.js';
import VCAPIExchangeMiddleware from './controllers/exchanges/vc-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(fs.readFileSync(`${__dirname}/package.json`));

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
  apis: [`${__dirname}/app.js`], // files containing annotations as above
};
const openapiSpecification = swaggerJsdoc(options);

export const app = express();

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));

app.use('/assets', express.static('dist/client/assets', {index: false}));
app.get('/health', health);

app.get('/.well-known/did.json', didWebDocument);
app.get('/.well-known/did-configuration.json', didConfigurationDocument);
app.get('/.well-known/jwks.json', jwksEndpoint);
app.get('/.well-known/openid-configuration', openIdConfiguration);

// Middleware that attaches the RP configuration to the request object, usually
// by inspecting the request for a client_id query parameter.
ResolveClientMiddleware(app);
AuthenticationMiddleware(app);
OidcValidationMiddleware(app);

/**
 * Middleware attaches exchange type-specific handlers to /login /exchange,
 * /token and/or other endpoints necessary for the operation of an exchange
 * over that protocol. Each middleware function needs to call `next()` if it
 * cannot handle the request.
 */
NativeExchangeMiddleware(app);
VCAPIExchangeMiddleware(app);
MicrosoftEntraVerifiedIdExchangeMiddleware(app);

/**
 * OIDC Endpoints: GET /login, POST /token
 */

/**
 * @openapi
 * /login:
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
 *         description: The redirect URI to return the user after getting their
 *           credential. (URL-encoded string.)
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
app.get('/login', login);

/**
 * @openapi
 * /token:
 *   post:
 *     summary: Completes an OIDC login flow by exchanging a code for id_token.
 *     tags:
 *       - OIDC
 *     operationId: OpenID Connect Token
 *     description:
 *       A client can use this endpoint to get VC-based user info from a wallet
 *       after the user has completed the wallet exchange and returned to the
 *       client with a code.
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
 *                   description: Always "Bearer", but access token is not used.
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
app.post('/token', exchangeCodeForToken);

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
app.post('/workflows/:workflowId/exchanges', initiateExchange); // Returns JSON

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
app.get('/workflows/:workflowId/exchanges/:exchangeId', getExchangeStatus);

// Token exchange requires rp to be set on req
app.post('/token', exchangeCodeForToken);

app.on('init', async function() {
  await exchanges.createIndex({recordExpiresAt: 1}, {expireAfterSeconds: 0});
  console.log('Created 24hr TTL index');
});

export const PORT = process.env.PORT || '8080';
