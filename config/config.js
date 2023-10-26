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
};

// If relyingParties is not an array, throw an error
if(!Array.isArray(relyingParties)) {
  throw new Error('Configuration relying_parties must be an array.');
}

relyingParties.forEach(validateRelyingParty);

// Validate workflow connection configuration
export const workflow = configDoc.workflow;
if(!workflow) {
  throw new Error('workflow must be defined.');
}
if(workflow.type === 'vc-api') {
  if(!workflow.base_url?.startsWith('http')) {
    throw new Error(
      'workflow base_url must be defined. This tool uses a VC-API ' +
      'exchange endpoint to communicate with wallets.'
    );
  } else if(typeof workflow.capability !== 'string') {
    throw new Error('workflow capability must be defined.');
  } else if(
    !workflow.clientSecret ||
    typeof workflow.clientSecret !== 'string' ||
    workflow.clientSecret.length < 1
  ) {
    throw new Error('workflow clientSecret must be defined.');
  }
} else if(workflow.type === 'native') {
  if(!workflow.steps.length) {
    throw new Error('workflow must have at least 1 step.');
  }
  if(!workflow.initialStep) {
    throw new Error('workflow initialStep must be set.');
  }
}

export const databaseConnectionUri = configDoc.db_connection_uri;
if(!databaseConnectionUri) {
  throw new Error('Database connection uri not found.');
}

export const defaultLanguage = configDoc.default_language || 'en';

export const translations = combineTranslations(configDoc.translations || {});

const defaultTheme = {
  cta: '#006847',
  primary: '#008f5a',
  header: '#004225'
};
export const theme = configDoc.theme || defaultTheme;
