import * as bedrock from '@bedrock/core';
import * as yaml from 'js-yaml';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import '@bedrock/views';
import '../lib/index.js';

import {applyRpDefaults} from './configUtils.js';
import {combineTranslations} from './translation.js';
import {logger} from '../lib/logger.js';

const {config: brConfig} = bedrock;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.join(__dirname, '..');

bedrock.events.on('bedrock-cli.parsed', async () => {
  await import(path.join(brConfig.paths.config, 'paths.js'));
  await import(path.join(brConfig.paths.config, 'core.js'));
});

bedrock.events.on('bedrock.configure', async () => {
  await import(path.join(brConfig.paths.config, 'server.js'));
  await import(path.join(brConfig.paths.config, 'express.js'));
  await import(path.join(brConfig.paths.config, 'https-agent.js'));
});

brConfig.views.bundle.packages.push({
  path: path.join(rootPath, 'web'),
  manifest: path.join(rootPath, 'web', 'manifest.json')
});

brConfig['bedrock-webpack'].configs.push({
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
  let {opencred} = brConfig;
  if(process.env.OPENCRED_CONFIG) {
    opencred = yaml.load(
      Buffer.from(process.env.OPENCRED_CONFIG, 'base64').toString()
    );
    brConfig.opencred = opencred;
    logger.info('Loaded config from environment variable');
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
   * @property {Object.<string, WorkflowStep>} steps - The steps of the \
   * workflow.
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
  opencred.options = opencred.options || {
    exchangeProtocols: ['openid4vp-qr', 'chapi-button']
  };

  /**
   * An list of relying parties (connected apps or workflows) in use by OpenCred
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

  const databaseConnectionUri = opencred.dbConnectionUri;
  if(databaseConnectionUri) {
    bedrock.config.mongodb.url = databaseConnectionUri;
  }

  opencred.defaultLanguage = opencred.defaultLanguage || 'en';

  opencred.translations = combineTranslations(opencred.translations || {});

  const defaultTheme = opencred.theme ?? {
    cta: '#006847',
    primary: '#008f5a',
    header: '#004225'
  };

  opencred.domain = opencred.domain ?? 'http://localhost:8080';

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
   * An list of relying parties (connected apps or workflows) in use by OpenCred
   * @type {RelyingParty[]}
   */
  opencred.relyingParties = configRPs.map(rp => {
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
  opencred.caStore = (opencred.caStore ?? [])
    .map(cert => cert.pem);

  // config = {
  //   databaseConnectionUri,
  //   didWeb,
  //   defaultLanguage,
  //   domain,
  //   options,
  //   relyingParties,
  //   signingKeys,
  //   translations,
  //   caStore
  // };
  logger.info('OpenCred Config Successfully Validated');
});
