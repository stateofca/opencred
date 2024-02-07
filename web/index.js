import * as brVue from '@bedrock/vue';
import * as polyfill from 'credential-handler-polyfill';
import {createRouter, createWebHistory} from 'vue-router';
import App from './App.vue';
import AppMain from './components/AppMain.vue';
import ButtonView from './components/ButtonView.vue';
import JsonNode from './components/JsonNode.vue';
import JsonView from './components/JsonView.vue';
import QRView from './components/QRView.vue';
import './styles.pcss';

brVue.initialize({
  async beforeMount({app}) {
    app.component('AppMain', AppMain);
    app.component('QRView', QRView);
    app.component('ButtonView', ButtonView);
    app.component('JsonNode', JsonNode);
    app.component('JsonView', JsonView);

    // ensure CHAPI is available
    await polyfill.loadOnce();

    // create router
    const router = createRouter({
      routes: [
        {
          path: '/login',
          component: () => import('./components/AppMain.vue')
        }
      ],
      history: createWebHistory(),
    });
    brVue.augmentRouter({app, router});
    app.use(router);

    // create root Vue component
    return App;
  }
});
