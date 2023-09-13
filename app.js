import express from 'express';
import cors from 'cors';

import './config/config.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use('/health', (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
  };
  try {
    res.send(healthCheck);
  } catch (error) {
    healthCheck.message = error;
    res.status(503), send();
  }
});

const PORT = process.env.PORT || '8080';
export {
  app,
  PORT,
};
