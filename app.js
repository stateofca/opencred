const express = require('express');
const cors = require('cors');

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

const PORT = '5000' || process.env.PORT;
module.exports = {
  app,
  PORT,
};
