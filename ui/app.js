import App from './App.vue';
import AppMain from './components/AppMain.vue';
import {createSSRApp} from 'vue';

export const createApp = function() {
  const app = createSSRApp(App);
  app.component('AppMain', AppMain);
  return app;
};
