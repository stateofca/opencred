import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

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

const defaultTranslations = {
  en: {
    translate: 'Translate',
    login_cta: 'Login with your credential wallet',
    login_explain: 'To login with your credential wallet, you will need ' +
    'to have the credential wallet app <with configurable URL to app ' +
    'stores> installed',
    app_install_explain: 'If you don\'t have a credential wallet yet, ' +
    'you can get one by downloading the credential wallet app ' +
    '<with configurable URL to app stores>',
    app_cta: 'Open wallet app',
    qr_explain: 'Looking for a QR Code to scan with you wallet app instead?',
    qr_cta: 'Scan the following QR Code with your wallet app',
    copyright: 'Powered by OpenCred'
  }
};
export const translations = configDoc.translations || defaultTranslations;

const defaultTheme = {
  cta: '#006847',
  primary: '#008f5a',
  header: '#004225'
};
export const theme = configDoc.theme || defaultTheme;
