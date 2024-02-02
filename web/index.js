import * as brVue from '@bedrock/vue';
import * as polyfill from 'credential-handler-polyfill';
import {config, extend} from '@bedrock/web';
import App from './App.vue';
import {createRouter} from 'vue-router';

console.error('TERSRTSDFASDFDSAFDSAFDAS');
brVue.initialize({
  async beforeMount({app}) {

    // ensure CHAPI is available
    await polyfill.loadOnce();

    extend({target: config, deep: true});

    // create router
    const router = createRouter({routes: [
      {
        path: '/login',
        component: () => import('./App.vue')
      }
    ]});
    console.log('TOESTSETFDAS');
    brVue.augmentRouter({app, router});
    app.use(router);

    // create root Vue component
    return App;
  }
});
