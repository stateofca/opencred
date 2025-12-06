/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as brQuasar from '@bedrock/quasar';
import * as brVue from '@bedrock/vue';
import * as polyfill from 'credential-handler-polyfill';
import {config, extend} from '@bedrock/web';
import {createRouter, createWebHistory} from 'vue-router';
import App from './App.vue';
import AuditPresentation from './views/AuditPresentation.vue';
import {createHead} from 'unhead';
import {createI18n} from 'vue-i18n';
import ErrorView from './components/ErrorView.vue';
import HomeView from './views/HomeView.vue';
import {httpClient} from '@digitalbazaar/http-client';
import LoginView from './views/LoginView.vue';
import {Notify} from 'quasar';
import TranslateIcon from './components/TranslateIcon.vue';
import VerificationView from './views/VerificationView.vue';
import VueCookies from 'vue-cookies';
import YouTubeVideo from './components/YouTubeVideo.vue';
import '@quasar/extras/material-icons/material-icons.css';
import './styles.pcss';

brVue.initialize({
  async beforeMount({app}) {
    const {data: appConfig} =
      await httpClient.get('/config/app.json' + window.location.search);
    extend({target: config, source: appConfig, deep: true});

    app.component('HomeView', HomeView);
    app.component('LoginView', LoginView);
    app.component('AuditPresentation', AuditPresentation);
    app.component('ErrorView', ErrorView);
    app.component('YouTubeVideo', YouTubeVideo);
    app.component('TranslateIcon', TranslateIcon);
    app.component('VerificationView', VerificationView);

    // ensure CHAPI is available
    await polyfill.loadOnce();

    const title = appConfig.translations[appConfig.defaultLanguage].pageTitle ??
      'Login';

    // create router
    const router = createRouter({
      routes: [
        {
          path: '/',
          component: () => import('./components/AppLayout.vue'),
          props: true,
          children: [
            {
              path: '',
              component: HomeView
            },
            {
              path: 'login',
              name: 'login',
              component: LoginView
            },
            {
              path: 'verification',
              name: 'verification',
              component: VerificationView
            }
          ],
          meta: {
            title
          }
        },
        {
          path: '/audit-vp',
          component: () => import('./views/AuditPresentation.vue'),
          meta: {
            title: 'Audit VP'
          }
        }
      ],
      history: createWebHistory(),
    });
    brVue.augmentRouter({app, router});
    app.use(router);
    const i18n = createI18n({
      locale: appConfig.defaultLanguage,
      legacy: false,
      warnHtmlMessage: false,
      messages: appConfig.translations
    });
    app.use(i18n);
    app.use(VueCookies);

    await brQuasar.initialize({app, quasarOptions: {
      runMode: 'web-client',
      plugins: {
        Notify
      }
    }});
    await brQuasar.theme({brand: appConfig.brand});
    createHead();
    // create root Vue component
    return App;
  }
});
