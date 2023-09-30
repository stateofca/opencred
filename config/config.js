import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import {combineTranslations} from './translation.js';

// Environment variables
dotenv.config();
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

  // If credential_context is not a string, throw an error
  if(
    !rp.credential_context ||
    typeof rp.credential_context !== 'string' ||
    !rp.credential_context.match(/^https?:\/\//)
  ) {
    throw new Error(
      `credential_context must be a URL in client ${rp.client_id}`
    );
  }

  // If credential_type is not a string throw an error
  if(
    !rp.credential_type ||
    typeof rp.credential_type !== 'string' ||
    rp.credential_type.length === 0
  ) {
    throw new Error(
      `credential_type must be defined in client ${rp.client_id}`
    );
  }

  // Credential issuer must be a string
  if(
    !rp.credential_issuer ||
    typeof rp.credential_issuer !== 'string' ||
    rp.credential_issuer.length === 0
  ) {
    throw new Error(
      `credential_issuer must be defined in client ${rp.client_id}`
    );
  }

};

// If relyingParties is not an array, throw an error
if(!Array.isArray(relyingParties)) {
  throw new Error('Configuration relying_parties must be an array.');
}

relyingParties.forEach(validateRelyingParty);
export const exchanger = configDoc.exchanger;
export const defaultLanguage = configDoc.default_language || 'en';

export const translations = combineTranslations(configDoc.translations || {});

const defaultTheme = {
  cta: '#006847',
  primary: '#008f5a',
  header: '#004225'
};
export const theme = configDoc.theme || defaultTheme;
