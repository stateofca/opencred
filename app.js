import cors from 'cors';
import express from 'express';

import {exchangeCodeForToken, login} from './controllers/controller.js';
import './config/config.js';

export const app = express();

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use('/static', express.static('public'));

app.use('/health', (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
  };
  try {
    res.send(healthCheck);
  } catch(error) {
    healthCheck.message = error;
    res.status(503);
    res.send(healthCheck);
  }
});

app.use('/login', login);
app.use('/token', exchangeCodeForToken);

export const PORT = process.env.PORT || '8080';
