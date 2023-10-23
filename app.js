import {
  createExchange as createExchangeNative,
  getExchangeStatusNative as getExchangeStatusNative
} from './controllers/plugins/native.js';
import {
  createExchange as createExchangeVCAPI,
  getExchangeStatus as getExchangeStatusVCAPI
} from './controllers/plugins/vc-api.js';
import cors from 'cors';
import express from 'express';

import {
  exchangeCodeForToken, health, login
} from './controllers/controller.js';
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
if(workflow.type === 'vc-api') {
  app.use('/login', createExchangeVCAPI, login);
  app.use('/exchange', getExchangeStatusVCAPI);
} else {
  app.use('/login', createExchangeNative, login);
  app.use('/exchange', getExchangeStatusNative);
}
app.use('/token', exchangeCodeForToken);

export const PORT = process.env.PORT || '8080';
