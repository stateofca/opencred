import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import 'dotenv/config';

import {combineTranslations} from './translation.js';

// Environment variables
const config_path = process.env.CONFIG_PATH || '/etc/app-config/config.yaml';

// Load config doc and parse YAML.
const configDoc = yaml.load(fs.readFileSync(config_path, 'utf8'));

export const relyingParties = configDoc.relying_parties;

const validateRelyingParty = rp => {
  if(!rp.client_id) {
    throw new Error('client_id is required for each configured relying_party');
  }
  if(!rp.client_secret) {
    throw new Error(`client_secret is required in ${rp.client_id}`);
  }

  // if redirect_uri doesn't match http or https throw an error
  if(!rp.redirect_uri.match(/^https?:\/\//)) {
    throw new Error(`redirect_uri must be a URI in client ${rp.client_id}`);
  }

  if(!rp.scopes || !Array.isArray(rp.scopes)) {
    throw new Error(
      `An array of scopes must be defined io client ${rp.client_id}.`
    );
  }
  if(!rp.scopes.map(s => s.name).includes('openid')) {
    throw new Error(`scopes in client ${rp.client_id} must include openid`);
  }

  // If there is no Presentation Request, throw an error
  if(
    !rp.vpr_query ||
    typeof rp.vpr_query !== 'string') {
    throw new Error(
      `Presentation Request vpr_query must appear in client ${rp.client_id}`
    );
  }

};

// If relyingParties is not an array, throw an error
if(!Array.isArray(relyingParties)) {
  throw new Error('Configuration relying_parties must be an array.');
}

relyingParties.forEach(validateRelyingParty);

// Validate exchanger connection configuration
export const exchanger = configDoc.exchanger;
if(!exchanger || !exchanger.base_url?.startsWith('http')) {
  throw new Error(
    'Exchanger base_url must be defined. This tool uses a VC-API ' +
    'exchange endpoint to communicate with wallets.'
  );
} else if(typeof exchanger.capability !== 'string') {
  throw new Error('Exchanger capability must be defined.');
} else if(
  !exchanger.clientSecret ||
  typeof exchanger.clientSecret !== 'string' ||
  exchanger.clientSecret.length < 1
) {
  throw new Error('Exchanger clientSecret must be defined.');
}

export const defaultLanguage = configDoc.default_language || 'en';

export const translations = combineTranslations(configDoc.translations || {});

const defaultTheme = {
  cta: '#006847',
  primary: '#008f5a',
  header: '#004225'
};
export const theme = configDoc.theme || defaultTheme;
