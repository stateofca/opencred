import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

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

  const context = {
    step: 'login',
    rp: {
      client_id: rp.client_id,
      redirect_uri: rp.redirect_uri,
      name: rp.name,
      icon: rp.icon,
      background_image: rp.background_image,
      workflow: {
        type: rp.workflow.type,
        id: rp.workflow.id
      }
    },
    translations,
    defaultLanguage,
    theme,
    exchangeData: {
      ...req.exchange,
      QR: await QRCode.toDataURL(req.exchange.OID4VP)
    }
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
}

/**
 * The middleware for the exchange type will initiate the exchange
 * or return an error response. If successful, the exchange data will
 * be available on the request object `req.exchange`.
 */
export async function initiateExchange(req, res) {
  const exchangeData = req.exchange;
  if(!exchangeData) {
    res.status(500).send(
      {message: 'Unexpected server error: no exchange data initiated'}
    );
    return;
  }

  res.send({...exchangeData, QR: await QRCode.toDataURL(exchangeData.OID4VP)});
}

export const getExchangeStatus = async (req, res) => {
  res.send({exchange: req.exchange});
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
