import App from './App.vue';
import AppMain from './components/AppMain.vue';
import {createSSRApp} from 'vue';
import MainView from './components/MainView.vue';
import QRView from './components/QRView.vue';

export const createApp = function() {
  const app = createSSRApp(App);
  app.component('AppMain', AppMain);
  app.component('QRView', QRView);
  app.component('MainView', MainView);
  return {app};
};
