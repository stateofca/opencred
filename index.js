import {app, PORT} from './app.js';

const bootstrap = () => {
  app.listen(PORT, async () => {
    console.log(`OpenCred app is listening on http://localhost:${PORT}..`);
    app.emit('listening', null);
  });
};

bootstrap();
