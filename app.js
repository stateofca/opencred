import cors from 'cors';
import express from 'express';

import {
  exchangeCodeForToken, getExchangeStatus, health, login
} from './controllers/controller.js';
import './config/config.js';

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
app.use('/login', login);
app.use('/exchange', getExchangeStatus);
app.use('/token', exchangeCodeForToken);

export const PORT = process.env.PORT || '8080';
