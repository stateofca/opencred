import cors from 'cors';
import {dirname} from 'node:path';
import express from 'express';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import {
  exchangeCodeForToken, getExchangeStatus, health, initiateExchange, login
} from './controllers/controller.js';

import AuthenticationMiddleware from './controllers/auth.js';
import CustomExchangeMiddleware from './controllers/exchanges/custom.js';
import {exchanges} from './common/database.js';
import NativeMiddleware from './controllers/exchanges/native.js';
import OidcMiddleware from './controllers/oidc.js';
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

// Middleware that attaches the RP configuration to the request object, usually
// by inspecting the request for a client_id query parameter.
ResolveClientMiddleware(app);
AuthenticationMiddleware(app);
OidcMiddleware(app);

/**
 * Middleware attaches exchange type-specific handlers to /login /exchange,
 * /token and/or other endpoints necessary for the operation of an exchange
 * over that protocol. Each middleware function needs to call `next()` if it
 * cannot handle the request.
 */
NativeMiddleware(app);
VCAPIExchangeMiddleware(app);
CustomExchangeMiddleware(app);

// Endpoints that initiate an exchange
app.get('/login', login); // returns HTML app

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
 *      of an exchange of a p articular workflow.
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
