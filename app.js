import cors from 'cors';
import express from 'express';

import {
  exchangeCodeForToken, getExchangeStatus, health, login
} from './controllers/controller.js';
import CustomExchangeMiddleware from './controllers/exchanges/custom.js';
import NativeMiddleware from './controllers/exchanges/native.js';
import VCAPIExchangeMiddleware from './controllers/exchanges/vc-api.js';
import {workflow} from './config/config.js';

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

// Install the proper exchange middleware
if(workflow.type === 'vc-api') {
  VCAPIExchangeMiddleware(app);
} else if(workflow.type === 'custom') {
  CustomExchangeMiddleware(app);
} else {
  NativeMiddleware(app);
}

app.use('/login', login);
app.use('/exchange', getExchangeStatus);
app.use('/token', exchangeCodeForToken);

export const PORT = process.env.PORT || '8080';
