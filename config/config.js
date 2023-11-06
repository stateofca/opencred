import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import 'dotenv/config';

import {combineTranslations} from './translation.js';

// Environment variables
const config_path = process.env.CONFIG_PATH || '/etc/app-config/config.yaml';

// Load config doc and parse YAML.
const configDoc = yaml.load(fs.readFileSync(config_path, 'utf8'));

/**
 * @typedef {Object} Workflow
 * @property {string} type - The type of the workflow.
 * @property {string} id - The ID of the workflow.
 * @property {string} base_url - The base URL of the workflow.
 * @property {string} capability - The capability of the workflow.
 * @property {string} clientSecret - The client secret of the workflow.
 * @property {Object} vpr - Verifiable Presentation Request JSON
 */

/**
 * @typedef {Object} RelyingParty
 * @property {string} name - The name of the relying party.
 * @property {string} client_id - The client ID, urlsafe.
 * @property {string} client_secret - The client secret, urlsafe.
 * @property {string} redirect_uri - The redirect URI of the relying party.
 * @property {string} description - The description of the relying party.
 * @property {string} icon - The icon URL of the relying party.
 * @property {string} background_image - Background image URL.
 * @property {Object} theme - The theme of the relying party.
 * @property {string} theme.cta - The call to action color, hex like "#6A5ACD"
 * @property {string} theme.primary - The primary color hex.
 * @property {string} theme.header - The header color hex.
 * @property {Array<Object>} scopes - OAuth2 scopes
 * @property {string} scopes[].name - The name of the scope.
 * @property {string} scopes[].description - The description of the scope.
 * @property {Workflow} workflow - VC Exchange Workflow
 * @property {Array<Object>} [claims] - Claims to extract into id_token.
 * @property {string} claims[].name - id_token property destination
 * @property {string} claims[].description - Extra description, justification
 * @property {string} claims[].claim_iri - The property IRI in credentialSubject
 * @property {Object.<string, Object.<string, string>>} translations - Strings
 */

/**
 * An list of relying parties (connected apps or workflows) in use by OpenCred
 * @type {RelyingParty[]}
 */
const configRPs = configDoc.relying_parties;

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

const validateWorkflow = rp => {
  if(!rp.workflow) {
    throw new Error('workflow must be defined.');
  }
  if(rp.workflow.type === 'vc-api') {
    if(!rp.workflow.base_url?.startsWith('http')) {
      throw new Error(
        'workflow base_url must be defined. This tool uses a VC-API exchange' +
        ` endpoint to communicate with wallets. (client: ${rp.client_id})`
      );
    } else if(typeof rp.workflow.capability !== 'string') {
      throw new Error(
        `workflow capability must be defined. (client: ${rp.client_id})`
      );
    } else if(
      !rp.workflow.clientSecret ||
      typeof rp.workflow.clientSecret !== 'string' ||
      rp.workflow.clientSecret.length < 1
    ) {
      throw new Error(
        `workflow clientSecret must be defined. (client: ${rp.client_id})`
      );
    }
  } else if(rp.workflow.type === 'native') {
    if(!rp.workflow.steps || Object.keys(rp.workflow.steps).length === 0) {
      throw new Error(
        `workflow must have at least 1 step. (client: ${rp.client_id})`
      );
    }
    if(!rp.workflow.initialStep) {
      throw new Error(
        `workflow initialStep must be set. (client: ${rp.client_id})`
      );
    }
  }
};

// If relyingParties is not an array, throw an error
if(!Array.isArray(configRPs)) {
  throw new Error('Configuration relying_parties must be an array.');
}

configRPs.forEach(validateRelyingParty);

// Validate workflow connection configuration
configRPs.forEach(validateWorkflow);

export const databaseConnectionUri = configDoc.db_connection_uri;
if(!databaseConnectionUri) {
  throw new Error('database_connection_uri not found in config.');
}

export const defaultLanguage = configDoc.default_language || 'en';

export const translations = combineTranslations(configDoc.translations || {});

const defaultTheme = configDoc.theme ?? {
  cta: '#006847',
  primary: '#008f5a',
  header: '#004225'
};

/**
 * An list of relying parties (connected apps or workflows) in use by OpenCred
 * @type {RelyingParty[]}
 */
export const relyingParties = configRPs.map(rp => {
  const theme = {
    ...defaultTheme,
    ...(rp.theme ? rp.theme : {})
  };
  return {
    ...rp,
    theme
  };
});
