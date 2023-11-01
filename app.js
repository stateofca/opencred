import cors from 'cors';
import express from 'express';

import {
  exchangeCodeForToken, getExchangeStatus, health, login
} from './controllers/controller.js';

import CustomExchangeMiddleware from './controllers/exchanges/custom.js';
import NativeMiddleware from './controllers/exchanges/native.js';
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

/**
 * Middleware attaches exchange type-specific handlers to /login /exchange,
 * /token and/or other endpoints necessary for the operation of an exchange
 * over that protocol. Each middleware function needs to call `next()` if it
 * cannot handle the request.
 */
NativeMiddleware(app);
VCAPIExchangeMiddleware(app);
CustomExchangeMiddleware(app);

// Login request requires rp and exchange to be set on req
app.use('/login', login);

// Exchange requires exchange to be set on req
app.use('/exchange', getExchangeStatus);

// Token exchange requires rp to be set on req
app.use('/token', exchangeCodeForToken);

export const PORT = process.env.PORT || '8080';
