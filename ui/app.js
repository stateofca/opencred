import App from './App.vue';
import AppMain from './components/AppMain.vue';
import ButtonView from './components/ButtonView.vue';
import {createSSRApp} from 'vue';
import JsonNode from './components/JsonNode.vue';
import JsonView from './components/JsonView.vue';
import QRView from './components/QRView.vue';

export const createApp = function() {
  const app = createSSRApp(App);
  app.component('AppMain', AppMain);
  app.component('QRView', QRView);
  app.component('ButtonView', ButtonView);
  app.component('JsonNode', JsonNode);
  app.component('JsonView', JsonView);
  return {app};
};
