import {createSSRApp} from 'vue';

export const createApp = function(data) {
  return createSSRApp({
    data: () => data,
    template: `
<nav style="max-width: 800px; margin: 1em auto;">
  <div>
  <a v-bind:href="rp.redirect_uri">
    <img v-bind:src="rp.icon" v-bind:alt="rp.name + 'Logo'" />
    <span>{{rp.name}}</span>
  </a>
  </div>
</nav>

<section style="max-width: 800px; margin: 1em auto;">
  <img v-bind:src="rp.background_image" 
    alt="Background Image representing the vibe of the site" />
  <div>
    <h1>{{translations[defaultLanguage].login_cta}}</h1>
    <p>{{translations[defaultLanguage].login_explain}}</p>
    <div>
      <a href="#">
        {{translations[defaultLanguage].app_cta}}
      </a>
    </div>
    <pre>{{exchangeData}}</pre>
  </div>
</section>
`,
  });
};
