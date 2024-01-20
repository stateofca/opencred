import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import 'dotenv/config';

import {applyRpDefaults} from './configUtils.js';
import {combineTranslations} from './translation.js';

let configDoc;
if(process.env.OPENCRED_CONFIG) {
  configDoc = yaml.load(
    Buffer.from(process.env.OPENCRED_CONFIG, 'base64').toString()
  );
} else {
  // Environment variables
  const configPath = process.env.CONFIG_PATH || '/etc/app-config/config.yaml';

  // Load config doc and parse YAML.
  configDoc = yaml.load(fs.readFileSync(configPath, 'utf8'));
}

/**
 * @typedef {Object} VcApiWorkflow
 * @property {'vc-api'} type - The type of the workflow.
 * @property {boolean} createChallenge - Whether to create a challenge?
 * @property {string} verifiablePresentationRequest - What to request
 */

/**
 * @typedef {Object} WorkflowStep
 * @property {boolean} createChallenge - Whether to create a challenge?
 * @property {string} verifiablePresentationRequest - What to request
 * @property {string} constraintsOverride - Override presentation definition \
 * constraints with value
* @property {Object.<string, WorkflowStep>} steps - Steps to execute
 */

/**
 * @typedef {Object} NativeWorkflow
 * @property {'native'} type - The type of the workflow.
 * @property {string} id - The ID of the workflow.
 * @property {string} initialStep - The id of the first step.
 * @property {Object.<string, WorkflowStep>} steps - The steps of the workflow.
 */

/**
 * @typedef {Object} EntraWorkflow
 * @property {'microsoft-entra-verified-id'} type - The type of the workflow.
 * @property {string} id - The ID of the workflow.
 * @property {string} baseUrl - The base URL of the workflow.
 * @property {string} capability - The capability of the workflow.
 * @property {string} clientSecret - The client secret of the workflow.
 * @property {Object} vpr - Verifiable Presentation Request JSON
 */

/**
 * @typedef {Object} RelyingParty
 * @property {string} name - The name of the relying party.
 * @property {string} clientId - The client ID, urlsafe.
 * @property {string} clientSecret - The client secret, urlsafe.
 * @property {string} redirectUri - The redirect URI of the relying party.
 * @property {string} description - The description of the relying party.
 * @property {string} icon - The icon URL of the relying party.
 * @property {string} backgroundImage - Background image URL.
 * @property {Object} theme - The theme of the relying party.
 * @property {string} theme.cta - The call to action color, hex like "#6A5ACD"
 * @property {string} theme.primary - The primary color hex.
 * @property {string} theme.header - The header color hex.
 * @property {Array<Object>} scopes - OAuth2 scopes
 * @property {string} scopes[].name - The name of the scope.
 * @property {string} scopes[].description - The description of the scope.
 * @property {VcApiWorkflow | NativeWorkflow | EntraWorkflow} workflow
 * @property {Array<Object>} [claims] - Claims to extract into id_token.
 * @property {string} claims[].name - id_token property destination
 * @property {string} claims[].path - The path from credentialSubject
 * @property {Object.<string, Object.<string, string>>} translations - Strings
 */

/**
 * @typedef {Object} Options
 * @property {Array.<string>} [exchangeProtocols]
 */

/**
 * An list of relying parties (connected apps or workflows) in use by OpenCred
 * exchangeProtocols: ['openid4vp-qr', 'chapi-button', 'openid4vp-link']
 * @type {Options}
 */
const options = configDoc.options || {
  exchangeProtocols: ['openid4vp-qr', 'chapi-button']
};

/**
 * An list of relying parties (connected apps or workflows) in use by OpenCred
 * @type {RelyingParty[]}
 */
const configRPs = configDoc.relyingParties;

// Workflow types
const WorkflowType = {
  VcApi: 'vc-api',
  Native: 'native',
  MicrosoftEntraVerifiedId: 'microsoft-entra-verified-id'
};

const WorkFlowTypes = Object.values(WorkflowType);

const validateRelyingParty = rp => {
  if(!rp.clientId) {
    throw new Error('clientId is required for each configured relyingParty');
  }
  if(!rp.clientSecret) {
    throw new Error(`clientSecret is required in ${rp.clientId}`);
  }

  // if redirectUri doesn't match http or https throw an error
  if(!rp.redirectUri.match(/^https?:\/\//)) {
    throw new Error(`redirectUri must be a URI in client ${rp.clientId}`);
  }

  if(!rp.scopes || !Array.isArray(rp.scopes)) {
    throw new Error(
      `An array of scopes must be defined io client ${rp.clientId}.`
    );
  }
  if(!rp.scopes.map(s => s.name).includes('openid')) {
    throw new Error(`scopes in client ${rp.clientId} must include openid`);
  }
  if(!rp.idTokenExpirySeconds) {
    rp.idTokenExpirySeconds = 3600;
  }
};

const validateWorkflow = rp => {
  if(!rp.workflow) {
    throw new Error('workflow must be defined.');
  }
  if(rp.workflow.type === WorkflowType.VcApi) {
    if(!rp.workflow.baseUrl?.startsWith('http')) {
      throw new Error(
        'workflow baseUrl must be defined. This tool uses a VC-API exchange' +
        ` endpoint to communicate with wallets. (client: ${rp.clientId})`
      );
    } else if(typeof rp.workflow.capability !== 'string') {
      throw new Error(
        `workflow capability must be defined. (client: ${rp.clientId})`
      );
    } else if(
      !rp.workflow.clientSecret ||
      typeof rp.workflow.clientSecret !== 'string' ||
      rp.workflow.clientSecret.length < 1
    ) {
      throw new Error(
        `workflow clientSecret must be defined. (client: ${rp.clientId})`
      );
    }
  } else if(rp.workflow.type === WorkflowType.Native) {
    if(!rp.workflow.steps || Object.keys(rp.workflow.steps).length === 0) {
      throw new Error(
        `workflow must have at least 1 step. (client: ${rp.clientId})`
      );
    }
    if(!rp.workflow.initialStep) {
      throw new Error(
        `workflow initialStep must be set. (client: ${rp.clientId})`
      );
    }
  } else if(rp.workflow.type === WorkflowType.MicrosoftEntraVerifiedId) {
    const {
      apiBaseUrl,
      apiLoginBaseUrl,
      apiClientId,
      apiClientSecret,
      apiTenantId,
      verifierDid,
      verifierName,
      acceptedCredentialType
    } = rp.workflow;
    if(!apiBaseUrl) {
      throw new Error('apiBaseUrl is required');
    }
    if(!apiLoginBaseUrl) {
      throw new Error('apiLoginBaseUrl is required');
    }
    if(!apiClientId) {
      throw new Error('apiClientId is required');
    }
    if(!apiClientSecret) {
      throw new Error('apiClientSecret is required');
    }
    if(!apiTenantId) {
      throw new Error('apiTenantId is required');
    }
    if(!verifierDid) {
      throw new Error('verifierDid is required');
    }
    if(!verifierName) {
      throw new Error('verifierName is required');
    }
    if(!acceptedCredentialType) {
      throw new Error('acceptedCredentialType is required');
    }
  } else {
    throw new Error(
      'workflow type must be one of the following values: ' +
      `${WorkFlowTypes.map(v => `'${v}'`).join(', ')}.`
    );
  }
};

// If relyingParties is not an array, throw an error
if(!Array.isArray(configRPs)) {
  throw new Error('Configuration relyingParties must be an array.');
}

const databaseConnectionUri = configDoc.dbConnectionUri;
if(!databaseConnectionUri) {
  throw new Error('databaseConnectionUri not found in config.');
}

const defaultLanguage = configDoc.defaultLanguage || 'en';

const translations = combineTranslations(configDoc.translations || {});

const defaultTheme = configDoc.theme ?? {
  cta: '#006847',
  primary: '#008f5a',
  header: '#004225'
};

const domain = configDoc.domain ?? 'http://localhost:8080';

const validateDidWeb = () => {
  return {
    mainEnabled: configDoc.didWeb?.mainEnabled,
    linkageEnabled: configDoc.didWeb?.linkageEnabled,
    mainDocument: JSON.parse(configDoc.didWeb?.mainDocument ?? '{}'),
    linkageDocument: JSON.parse(configDoc.didWeb?.linkageDocument ?? '{}')
  };
};
const didWeb = validateDidWeb();

const validateSigningKeys = () => {
  if(!configDoc.signingKeys) {
    return [];
  }
  configDoc.signingKeys.forEach(sk => {
    if(!sk.type) {
      throw new Error('Each signingKey must have a type.');
    }
    if(!Array.isArray(sk.purpose) || !sk.purpose?.length) {
      throw new Error('Each signingKey must have at least one purpose.');
    }
    if(
      sk.type == 'ES256' &&
      (!sk.privateKeyPem || !sk.publicKeyPem)
    ) {
      throw new Error(
        'Each ES256 signingKey must have a privateKeyPem and publicKeyPem.'
      );
    }
  });
};
const signingKeys = configDoc.signingKeys ?? [];
validateSigningKeys();

/**
 * An list of relying parties (connected apps or workflows) in use by OpenCred
 * @type {RelyingParty[]}
 */
const relyingParties = configRPs.map(rp => {
  const app = applyRpDefaults(configRPs, rp);
  validateRelyingParty(app);
  validateWorkflow(app);
  const theme = {
    ...defaultTheme,
    ...(app.theme ? app.theme : {})
  };
  return {
    ...app,
    theme
  };
});

/**
 * A list of trusted root certificates
 */
const caStore = (configDoc.caStore ?? [])
  .map(cert => cert.pem);

export const config = {
  databaseConnectionUri,
  didWeb,
  defaultLanguage,
  domain,
  options,
  relyingParties,
  signingKeys,
  translations,
  caStore
};
