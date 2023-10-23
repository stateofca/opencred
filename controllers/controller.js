import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

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
  const [rendered, preloadLinks] = await render(manifest, req.safeContext);
  const html = template
    .replace(`<!--preload-links-->`, preloadLinks)
    .replace(`<!--app-html-->`, rendered)
    .replace(`<!--app-context-->`, `<script>window.ctx =
      ${JSON.stringify(req.safeContext)};</script>`)
    .replace(`<!--app-title-->`,
      `<title>${req.safeContext.rp.name} Login</title>`);
  res.status(200).set({'Content-Type': 'text/html'}).end(html);
  return;
}

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
