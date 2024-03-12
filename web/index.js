/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as brQuasar from '@bedrock/quasar';
import * as brVue from '@bedrock/vue';
import * as polyfill from 'credential-handler-polyfill';
import {config, extend} from '@bedrock/web';
import {createRouter, createWebHistory} from 'vue-router';
import App from './App.vue';
import AppMain from './components/AppMain.vue';
import ButtonView from './components/ButtonView.vue';
import {httpClient} from '@digitalbazaar/http-client';
import JsonNode from './components/JsonNode.vue';
import JsonView from './components/JsonView.vue';
import {Notify} from 'quasar';
import QRView from './components/QRView.vue';
import './styles.pcss';

brVue.initialize({
  async beforeMount({app}) {
    const {data: appConfig} = await httpClient.get('/config/app.json');
    extend({target: config, source: appConfig, deep: true});

    app.component('AppMain', AppMain);
    app.component('QRView', QRView);
    app.component('ButtonView', ButtonView);
    app.component('JsonNode', JsonNode);
    app.component('JsonView', JsonView);

    // ensure CHAPI is available
    await polyfill.loadOnce();

    const title = appConfig.translations[appConfig.defaultLanguage].pageTitle ??
      'Login';

    // create router
    const router = createRouter({
      routes: [
        {
          path: '/login',
          component: () => import('./components/AppMain.vue'),
          meta: {
            title
          }
        }
      ],
      history: createWebHistory(),
    });
    brVue.augmentRouter({app, router});
    app.use(router);

    await brQuasar.initialize({app, quasarOptions: {
      plugins: {
        Notify
      }
    }});
    await brQuasar.theme({brand: appConfig.brand});

    // create root Vue component
    return App;
  }
});
