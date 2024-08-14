/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import {klona} from 'klona';
import path from 'node:path';
import 'dotenv/config';
import '@bedrock/views';

import {applyRpDefaults} from './configUtils.js';
import {combineTranslations} from './translation.js';
import {logger} from '../lib/logger.js';

const {config} = bedrock;
config.opencred = {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.join(__dirname, '..');

bedrock.events.on('bedrock-cli.parsed', async () => {
  await import(path.join(config.paths.config, 'paths.js'));
  await import(path.join(config.paths.config, 'core.js'));
});

bedrock.events.on('bedrock.configure', async () => {
  await import(path.join(config.paths.config, 'express.js'));
  await import(path.join(config.paths.config, 'server.js'));
  await import(path.join(config.paths.config, 'database.js'));
  await import(path.join(config.paths.config, 'https-agent.js'));
  await import(path.join(config.paths.config, 'authorization.js'));
});

config.views.bundle.packages.push({
  path: path.join(rootPath, 'web'),
  manifest: path.join(rootPath, 'web', 'manifest.json')
});

config['bedrock-webpack'].configs.push({
  module: {
    rules: [{
      test: /\.pcss$/i,
      include: path.resolve(__dirname, '..', 'web'),
      use: [
        'style-loader',
        'css-loader',
        {
          loader: 'postcss-loader',
          options: {
            postcssOptions: {
              plugins: [
                'postcss-preset-env',
                'tailwindcss',
                'autoprefixer',
              ]
            }
          }
        }
      ]
    }]
  }
});

bedrock.events.on('bedrock.init', async () => {
  const {opencred} = config;
  /**
   * @typedef {Object} VcApiWorkflow
   * @property {'vc-api'} type - The type of the workflow.
   * @property {string} id - The ID of the workflow.
   * @property {string[]} untrustedVariableAllowList - List of initialization
   * variables to save
   * @property {string} baseUrl - The base URL of the workflow.
   * @property {string} capability - The capability of the workflow.
   * @property {string} clientSecret - The client secret of the workflow.
   * @property {string} vpr - Verifiable Presentation Request JSON string.
   */

  /**
   * @typedef {Object} WorkflowStep
   * @property {boolean} createChallenge - Whether to create a challenge?
   * @property {string} verifiablePresentationRequest - What to request
   * @property {string} constraintsOverride - Override presentation definition
   * constraints with value
  * @property {Object.<string, WorkflowStep>} steps - Steps to execute
  */

  /**
   * @typedef {Object} NativeWorkflow
   * @property {'native'} type - The type of the workflow.
   * @property {string} id - The ID of the workflow.
   * @property {string[]} untrustedVariableAllowList - List of initialization
   * variables to save
   * @property {string} initialStep - The id of the first step.
   * @property {Object.<string, WorkflowStep>} steps - The steps of the \
   * workflow.
   */

  /**
   * @typedef {Object} EntraWorkflow
   * @property {'microsoft-entra-verified-id'} type - The type of the workflow.
   * @property {string} id - The ID of the workflow.
   * @property {string[]} untrustedVariableAllowList - List of initialization
   * variables to save
   * @property {string} apiBaseUrl - The base URL of the workflow.
   * @property {string} apiLoginBaseUrl - The base URL of the auth domain
   * @property {string} apiTenantId - The Tenant ID for the Entra API
   * @property {string} apiClientId - The client ID for the App within tenant
   * @property {string} apiClientSecret - The client secret for the App
   * @property {string} verifierDid - The DID of the verifier, this app
   * @property {string} verifierName - The name of the verifier app
   */

  /**
   * @typedef {Object} RelyingParty
   * @property {string} name - The name of the relying party.
   * @property {string} clientId - The client ID, urlsafe.
   * @property {string} clientSecret - The client secret, urlsafe.
   * @property {string} redirectUri - The redirect URI of the relying party.
   * @property {string} description - The description of the relying party.
   * @property {string} primaryLogo - The primary logo of the relying party.
   * @property {string} primaryLink - The primary link of the relying party.
   * @property {string} secondaryLogo - The secondary logo of the relying party.
   * @property {string} secondaryLogo - The secondary link of the relying party.
   * @property {string} homeLink - The home link of the relying party.
   * @property {string} backgroundImage - Background image URL.
   * @property {Object} brand - The brand of the relying party.
   * @property {string} brand.cta - The call to action color, hex like "#6A5ACD"
   * @property {string} brand.primary - The primary color hex.
   * @property {string} brand.header - The header color hex.
   * @property {Array<string>} trustedCredentialIssuers - Trusted issuers
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

  const availableExchangeProtocols = ['openid4vp', 'chapi'];
  /**
   * A list of exchange protocols in use by OpenCred
   * exchangeProtocols: ['openid4vp', 'chapi']
   * @type {Options}
   */
  opencred.options = opencred.options || {
    exchangeProtocols: availableExchangeProtocols
  };
  if(!opencred.options.exchangeProtocols
    .every(el => availableExchangeProtocols.includes(el))) {
    throw new Error(`Invalid exchange protocol configured: ` +
      `Found: [${opencred.options.exchangeProtocols}], ` +
      `Available: [${availableExchangeProtocols}]`);
  }

  if(!opencred.relyingParties) {
    opencred.relyingParties = [];
  }
  /**
   * A list of relying parties (connected apps or workflows) in use by OpenCred
   * @type {RelyingParty[]}
   */
  const configRPs = opencred.relyingParties;

  // Workflow types
  const WorkflowType = {
    VcApi: 'vc-api',
    Native: 'native',
    MicrosoftEntraVerifiedId: 'microsoft-entra-verified-id'
  };

  const WorkFlowTypes = Object.values(WorkflowType);

  const validateRelyingParty = rp => {
    if(!rp.clientId) {
      throw new Error('clientId is required for each configured relyingParty.');
    }
    if(!rp.clientSecret) {
      throw new Error(`clientSecret is required in ${rp.clientId}.`);
    }

    // Use redirectUri for proxy of OIDC being enabled or not
    if(rp.redirectUri) {
      // if redirectUri doesn't match http or https throw an error
      if(!rp.redirectUri.match(/^https?:\/\//)) {
        throw new Error(`redirectUri must be a URI in client ${rp.clientId}.`);
      }

      if(!rp.scopes || !Array.isArray(rp.scopes)) {
        throw new Error(
          `An array of scopes must be defined in client ${rp.clientId}.`
        );
      }
      if(!rp.scopes.map(s => s.name).includes('openid')) {
        throw new Error(`scopes in client ${rp.clientId} must include openid.`);
      }
      if(!rp.idTokenExpirySeconds) {
        rp.idTokenExpirySeconds = 3600;
      }
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
        steps,
        initialStep
      } = rp.workflow;
      if(!apiBaseUrl) {
        throw new Error(
          `apiBaseUrl is missing for workflow in client ${rp.clientId}.`);
      }
      if(!apiLoginBaseUrl) {
        throw new Error(
          `apiLoginBaseUrl is missing for workflow in client ${rp.clientId}.`);
      }
      if(!apiClientId) {
        throw new Error(
          `apiClientId is missing for workflow in client ${rp.clientId}.`);
      }
      if(!apiClientSecret) {
        throw new Error(
          `apiClientSecret is missing for workflow in client ${rp.clientId}.`);
      }
      if(!apiTenantId) {
        throw new Error(
          `apiTenantId is missing for workflow in client ${rp.clientId}.`);
      }
      if(!verifierDid) {
        throw new Error(
          `verifierDid is missing for workflow in client  ${rp.clientId}.`);
      }
      if(!verifierName) {
        throw new Error(
          `verifierName is missing for workflow in client ${rp.clientId}.`);
      }
      if(!steps) {
        throw new Error(
          `steps is missing for workflow in client ${rp.clientId}.`);
      }
      if(!initialStep) {
        throw new Error(
          `initialStep is missing for workflow in client  ${rp.clientId}.`);
      }
      const {acceptedCredentialType} = steps[initialStep];
      if(!acceptedCredentialType) {
        throw new Error(
          `acceptedCredentialType is missing for workflow in ${rp.clientId}.`);
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

  opencred.defaultLanguage = opencred.defaultLanguage || 'en';

  opencred.translations = combineTranslations(opencred.translations || {});

  const defaultBrand = opencred.defaultBrand ?? {
    cta: '#006847',
    primary: '#008f5a',
    header: '#004225'
  };

  const validateDidWeb = () => {
    return {
      mainEnabled: opencred.didWeb?.mainEnabled,
      linkageEnabled: opencred.didWeb?.linkageEnabled,
      mainDocument: JSON.parse(opencred.didWeb?.mainDocument ?? '{}'),
      linkageDocument: JSON.parse(opencred.didWeb?.linkageDocument ?? '{}')
    };
  };
  opencred.didWeb = validateDidWeb();

  const validateSigningKeys = () => {
    if(!opencred.signingKeys) {
      return [];
    }
    opencred.signingKeys.forEach(sk => {
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
  opencred.signingKeys = opencred.signingKeys ?? [];
  validateSigningKeys();

  /**
   * A list of relying parties (connected apps or workflows) in use by OpenCred
   * @type {RelyingParty[]}
   */
  opencred.relyingParties = configRPs.map(rp => {
    const app = applyRpDefaults(configRPs, rp);
    validateRelyingParty(app);
    validateWorkflow(app);
    const brand = {
      ...defaultBrand,
      ...(app.brand ? app.brand : {})
    };
    return {
      ...app,
      brand
    };
  });

  /**
   * A list of trusted issuers
   */
  const validateTrustedCredentialIssuers = scope => {
    if(!scope.trustedCredentialIssuers) {
      return;
    }
    if(!Array.isArray(scope.trustedCredentialIssuers)) {
      throw new Error('trustedCredentialIssuers must be an array');
    }
    for(const issuer of scope.trustedCredentialIssuers) {
      if(typeof issuer !== 'string') {
        throw new Error('Each issuer in trustedCredentialIssuers ' +
        'must be a string');
      }
    }
  };
  const applyDefaultTrustedCredentialIssuers = () => {
    opencred.trustedCredentialIssuers = opencred.trustedCredentialIssuers ?? [];
    validateTrustedCredentialIssuers(opencred);
    for(const rp of opencred.relyingParties) {
      rp.trustedCredentialIssuers = rp.trustedCredentialIssuers ?? [];
      validateTrustedCredentialIssuers(rp);
      rp.trustedCredentialIssuers = rp.trustedCredentialIssuers.length === 0 ?
        opencred.trustedCredentialIssuers :
        rp.trustedCredentialIssuers;
    }
  };
  applyDefaultTrustedCredentialIssuers();

  /**
   * Exchange expiry timeout in seconds
   */
  const validateExchangeActiveExpirySeconds = scope => {
    if(!scope.exchangeActiveExpirySeconds) {
      return;
    }
    if(
      typeof scope.exchangeActiveExpirySeconds !== 'number' ||
      scope.exchangeActiveExpirySeconds < 60 ||
      scope.exchangeActiveExpirySeconds > 60 * 30
    ) {
      throw new Error('exchangeActiveExpirySeconds must be a number between ' +
        '60 (1 minute) and 3600 (1 hour)');
    }
  };

  const applyDefaultExchangeActiveExpirySeconds = () => {
    opencred.exchangeActiveExpirySeconds =
      opencred.exchangeActiveExpirySeconds ?? 60;
    validateExchangeActiveExpirySeconds(opencred);
    for(const rp of opencred.relyingParties) {
      validateExchangeActiveExpirySeconds(rp);
      rp.exchangeActiveExpirySeconds = rp.exchangeActiveExpirySeconds ?
        rp.exchangeActiveExpirySeconds :
        opencred.exchangeActiveExpirySeconds;
    }
  };
  applyDefaultExchangeActiveExpirySeconds();

  /**
   * A list of trusted root certificates
   */
  opencred.caStore = (opencred.caStore ?? [])
    .map(cert => cert.pem);

  /**
   * reCAPTCHA configuration
   */
  if(!opencred.reCaptcha) {
    opencred.reCaptcha = {};
  }
  if(!opencred.reCaptcha.pages) {
    opencred.reCaptcha.pages = [];
  }
  opencred.reCaptcha.enable =
    opencred.reCaptcha.enable === true;
  const availableReCaptchaVersions = [2, 3];

  const validateReCaptcha = () => {
    if(opencred.reCaptcha.enable) {
      if(!opencred.reCaptcha.version ||
        !opencred.reCaptcha.siteKey ||
        !opencred.reCaptcha.secretKey) {
        throw new Error(
          'When the "reCaptcha.enable" config value is "true", ' +
          'the following config values must also be provided: ' +
          '"reCaptcha.version", "reCaptcha.siteKey", and "reCaptcha.secretKey"'
        );
      }
      if(!availableReCaptchaVersions.includes(opencred.reCaptcha.version)) {
        throw new Error('The config value of "reCaptcha.version" must be ' +
          'one of the following values: ' +
          availableReCaptchaVersions.map(v => `"${v}"`).join(', '));
      }
    }
  };
  validateReCaptcha();

  /**
   * Auditing configuration
   */
  if(!opencred.audit) {
    opencred.audit = {};
  }
  if(!opencred.audit.fields) {
    opencred.audit.fields = [];
  }
  opencred.audit.enable =
    opencred.audit.enable === true;

  /**
   * A field to audit in a VP token
   * @typedef {Object} AuditField
   * @property {'text' | 'number' | 'date' | 'dropdown'} type
   * - Type of audit field.
   * @property {string} id - Unique ID of audit field.
   * @property {string} name - Name of audit field.
   * @property {string} path - Path of audit field in the VP token.
   * @property {string} required - Whether audit field is required.
   * @property {string} options - Options for dropdown fields.
   */

  const requiredAuditFieldKeys = ['type', 'id', 'name', 'path', 'required'];
  const auditFieldTypes = ['text', 'number', 'date', 'dropdown'];

  const validateAuditFields = () => {
    if(opencred.audit.fields.length === 0) {
      return;
    }
    if(!Array.isArray(opencred.audit.fields)) {
      throw new Error('The "audit.fields" config value must be an array.');
    }
    for(const field of opencred.audit.fields) {
      if(!requiredAuditFieldKeys.every(f => Object.keys(field).includes(f))) {
        throw new Error('Each object in "audit.fields" must have the ' +
          'following keys: ' +
          requiredAuditFieldKeys.map(k => `"${k}"`).join(', '));
      }
      if(!auditFieldTypes.includes(field.type)) {
        throw new Error('Each object in "audit.fields" must have one of the ' +
          'following types: ' +
          auditFieldTypes.map(t => `"${t}"`).join(', '));
      }
    }
    const auditFieldsHaveUniqueIds = klona(opencred.audit.fields)
      .map(k => k.id)
      .sort()
      .reduce((unique, currentId, currentIndex, ids) =>
        unique && currentId !== ids[currentIndex - 1], true);
    if(!auditFieldsHaveUniqueIds) {
      throw new Error('Each object in "audit.fields" must have a unique "id".');
    }
    const auditFieldsHaveUniquePaths = klona(opencred.audit.fields)
      .map(k => k.id)
      .sort()
      .reduce((unique, currentPath, currentIndex, paths) =>
        unique && currentPath !== paths[currentIndex - 1], true);
    if(!auditFieldsHaveUniquePaths) {
      throw new Error('Each object in "audit.fields" must have ' +
        'a unique "path".');
    }
  };
  validateAuditFields();

  logger.info('OpenCred Config Successfully Validated.');
});
