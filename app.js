import cors from 'cors';
import express from 'express';

import {
  exchangeCodeForToken, getExchangeStatus, health, initiateExchange, login
} from './controllers/controller.js';

import CustomExchangeMiddleware from './controllers/exchanges/custom.js';
import NativeMiddleware from './controllers/exchanges/native.js';
import OidcMiddleware from './controllers/oidc.js';
import ResolveClientMiddleware from './controllers/resolveClient.js';
import VCAPIExchangeMiddleware from './controllers/exchanges/vc-api.js';

export const app = express();

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use('/assets', express.static('dist/client/assets', {index: false}));
app.use('/health', health);

// Midleware that attaches the RP configuration to the request object, usually
// by inspecting the request for a client_id query parameter.
ResolveClientMiddleware(app);
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
app.use('/login', login); // returns HTML app

/**
 * @openapi
 * /:
 *   post:
 *    summary: Initiates an exchange of information.
 *    tags:
 *     - Exchanges
 *    security:
 *     - networkAuth: []
 *     - oAuth2: []
 *     - zCap: []
 *    operationId: initiateExchange
 *    description:
 *      A client can use this endpoint to initiate an exchange of a particular
 *      type. The client can include HTTP POST information related to the
 *      details of exchange it would like to initiate. If the server understands
 *      the request, it returns a Verifiable Presentation Request. A request
 *      that the server cannot understand results in an error.
 *    parameters:
 *      - name: exchange-id
 *        description: A potentially human-readable identifier for an exchange.
 *        in: path
 *        required: true
 *        schema:
 *          type: string
 *          minimum: 3
 *          pattern: "[a-z0-9][a-z0-9\\-]{2,}"
 *    requestBody:
 *      description:
 *        Information related to the type of exchange the client would like
 *        to start.
 *      content:
 *        application/json:
 *          schema:
 *            anyOf:
 *              - "type": "object",
 *                "description": "Data necessary to initiate the exchange."
 *              - type: object
 *                properties:
 *                  query:
 *                    type: object
 *                    description: See vp-request-spec for details.
 *                    properties:
 *                      type:
 *                        type: string
 *                        description: "The type of query for reply"
 *                      credentialQuery:
 *                        type: object
 *                        description: "Details of the client's presentation"
 *    responses:
 *      "200":
 *        description: Proceed with exchange.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: "#/components/schemas/VerifiablePresentationRequestBody"
 *      "400":
 *        description: Request is malformed.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: "#/components/schemas/ErrorResponse"
 *      "500":
 *        description: Internal server error.
 */
app.post('/workflows/:workflowId/exchanges', initiateExchange); // Returns JSON

// Exchange requires exchange to be set on req
app.get('/workflows/:workflowId/exchanges/:exchangeId', getExchangeStatus);

// Token exchange requires rp to be set on req
app.use('/token', exchangeCodeForToken);

export const PORT = process.env.PORT || '8080';
