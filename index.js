const { app, PORT } = require('./app');

const bootstrap = () => {
  app.listen(PORT, () => {
    console.log(`app is listening on http://localhost:${PORT}..`);
  });
};

bootstrap();
