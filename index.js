const { app, PORT } = require('./app');
const dbConnection = require('./config/db');

const bootstrap = () => {
  app.listen(PORT, () => {
    dbConnection();
    console.log(`app is listening on http://localhost:${PORT}..`);
  });
};

bootstrap();
