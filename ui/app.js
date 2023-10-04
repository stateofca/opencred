import App from './App.vue';
import AppMain from './components/AppMain.vue';
import ButtonView from './components/ButtonView.vue';
import {createSSRApp} from 'vue';
import QRView from './components/QRView.vue';

export const createApp = function() {
  const app = createSSRApp(App);
  app.component('AppMain', AppMain);
  app.component('QRView', QRView);
  app.component('ButtonView', ButtonView);
  return {app};
};
