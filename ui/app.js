// import App from './App.vue';
import {createSSRApp} from 'vue';

export const createApp = function(data) {
  return createSSRApp({
    data: () => data,
    template: `
<link rel="stylesheet" href="/static/tailwind.css">
<header class="flex bg-green-500 justify-between items-center p-6">
  <a v-bind:href="rp.redirect_uri"
    class="flex items-center gap-3">
    <img v-bind:src="rp.icon" v-bind:alt="rp.name + 'Logo'" />
    <span>{{rp.name}}</span>
  </a>
  <button class="bg-green-700 text-white p-2 rounded">Translate</button>
</header>
<div
  class="bg-no-repeat bg-cover">
  <div class="bg-white w-full text-center py-4">
    <h1>Home</h1>
  </div>
  <div class="bg-no-repeat bg-cover" 
    style="background-image: url('${data.rp.background_image}');">

    <div class="text-center text-6xl py-10">
      &nbsp
    </div>
    
    <div class="bg-white mx-auto p-10 rounded-md max-w-xl">
      <h2 class="text-4xl mb-4">{{translations[defaultLanguage].login_cta}}</h2>
      <p class="mb-4">{{translations[defaultLanguage].login_explain}}</p>
      <p class="mb-6">{{translations[defaultLanguage].app_install_explain}}</p>
      <div class="flex justify-center">
        <button class="bg-green-500 text-white py-2 px-4 rounded-full my-8 ">
          {{translations[defaultLanguage].app_cta}}
        </button>
      </div>
      <p class="text-center mb-2">
        {{translations[defaultLanguage].qr_explain}}
      </p>
      <p class="text-center">
        <a href="#" class="text-green-500">
          {{translations[defaultLanguage].qr_cta}}
        </a>
      </p>
    </div>
  </div>
</div>
<footer class="text-left p-6">
  {{translations[defaultLanguage].copyright}}
</footer>`,
  });
};
