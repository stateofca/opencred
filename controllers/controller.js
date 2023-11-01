import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import {
  defaultLanguage, theme, translations
} from '../config/config.js';
import {render} from '../dist/server/entry-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../dist/client/ssr-manifest.json'), 'utf-8'));
const template = fs.readFileSync(
  path.join(__dirname, '../dist/client/index.html'), 'utf-8');

export async function exchangeCodeForToken(req, res) {
  res.status(500).send('Not implemented');
}

export async function login(req, res) {
  const rp = req.rp;

  // Validate Redirect URI is permitted
  if(!req.query.redirect_uri) {
    res.status(400).send({message: 'redirect_uri is required'});
    return;
  } else if(rp.redirect_uri != req.query.redirect_uri) {
    res.status(400).send({message: 'Unknown redirect_uri'});
    return;
  }

  // Validate scope is openid only.
  if(!req.query.scope) {
    res.status(400).send({message: 'scope is required'});
    return;
  } else if(req.query.scope !== 'openid') {
    res.status(400).send({message: 'Invalid scope'});
    return;
  }

  const context = {
    step: 'login',
    rp: {
      client_id: rp.client_id,
      redirect_uri: rp.redirect_uri,
      name: rp.name,
      icon: rp.icon,
      background_image: rp.background_image
    },
    translations,
    defaultLanguage,
    theme,
    exchangeData: req.exchange
  };
  const [rendered, preloadLinks] = await render(manifest, context);
  const html = template
    .replace(`<!--preload-links-->`, preloadLinks)
    .replace(`<!--app-html-->`, rendered)
    .replace(`<!--app-context-->`, `<script>window.ctx =
      ${JSON.stringify(context)};</script>`)
    .replace(`<!--app-title-->`,
      `<title>${context.rp.name} Login</title>`);
  res.status(200).set({'Content-Type': 'text/html'}).end(html);
  return;
}

export const getExchangeStatus = async (req, res) => {
  res.send(req.exchange);
  return;
};

export const health = (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
  };
  try {
    res.send(healthCheck);
  } catch(error) {
    healthCheck.message = error;
    res.status(503);
    res.send(healthCheck);
  }
};
