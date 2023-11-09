import {app, PORT} from './app.js';

const bootstrap = () => {
  app.emit('init', null);
  app.listen(PORT, async () => {
    console.log(`OpenCred app is listening on http://localhost:${PORT}..`);
  });
};

bootstrap();
