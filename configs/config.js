/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';
import {applyWorkflowDefaults, OpenCredConfigSchema} from './config-utils.js';
import {buildAuthorizationConfig} from './authorization.js';
import {combineTranslations} from './translation.js';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getRegisteredRedirectUris} from '../lib/redirect-uri.js';
import {isDcApiAvailable} from '../common/dcapi.js';
import {logger} from '../lib/logger.js';
import path from 'node:path';
import {ZodError} from 'zod';
import 'dotenv/config';
import '@bedrock/views';

/** ---------------- Initial Config on App Start -------------------- */
const {config} = bedrock;

config.opencred = {}; // Initialize empty opencred settings

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.join(__dirname, '..');

/** ---------------------- Bedrock Events --------------------------- */
bedrock.events.on('bedrock-cli.parsed', async () => {
  await import(path.join(config.paths.config, 'paths.js'));
  await import(path.join(config.paths.config, 'core.js'));
});

bedrock.events.on('bedrock.configure', async () => {
  await import(path.join(config.paths.config, 'express.js'));
  await import(path.join(config.paths.config, 'server.js'));
  await import(path.join(config.paths.config, 'database.js'));
  await import(path.join(config.paths.config, 'https-agent.js'));
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
                'autoprefixer'
              ]
            }
          }
        }
      ]
    }]
  }
});

/**
 * Auto-generates an access_token signing key if none exists in config.
 * This key signs exchange result tokens (exchange_token JWTs) after
 * presentation. Logs a warning about load-balanced deployments.
 *
 * @param {object} opencredConfig - OpenCred config object (mutated).
 */
function ensureAccessTokenKey(opencredConfig) {
  const hasAccessTokenKey = opencredConfig.signingKeys?.some(
    k => k.purpose?.includes('access_token')
  );

  if(!hasAccessTokenKey) {
    const {privateKey, publicKey} = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: {format: 'pem', type: 'pkcs8'},
      publicKeyEncoding: {format: 'pem', type: 'spki'}
    });

    const keyId = crypto.createHash('sha256').update(publicKey).digest('hex');

    const newKey = {
      type: 'ES256',
      id: keyId,
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
      purpose: ['access_token']
    };

    if(!opencredConfig.signingKeys) {
      opencredConfig.signingKeys = [];
    }
    opencredConfig.signingKeys.push(newKey);

    logger.warning(
      'Auto-generated an access_token signing key. WARNING: In ' +
      'load-balanced deployments, this auto-generated key will differ on ' +
      'each instance and cause verification failures when a request is ' +
      'handled by a different instance than the one that issued the token. ' +
      'To resolve, provision a consistent access_token key via ' +
      'opencred.signingKeys configuration.'
    );
  }
}

/**
 * Validates that workflow identifiers (clientId, legacy workflowId) are unique
 * across all configured workflows.
 *
 * @param {object} opencredConfig - Parsed OpenCred config.
 * @throws {Error} If duplicate clientId or workflowId values are found.
 */
export function validateWorkflowIdentifiers(opencredConfig) {
  const workflows = opencredConfig.workflows ?? [];

  // Check for duplicate clientId values
  const clientIds = new Map();
  for(const w of workflows) {
    if(clientIds.has(w.clientId)) {
      throw new Error(
        `Duplicate clientId "${w.clientId}" found in workflow configuration. ` +
        `Each workflow must have a unique clientId.`
      );
    }
    clientIds.set(w.clientId, w);
  }

  // Check for duplicate workflowId values
  const workflowIds = new Map();
  for(const w of workflows) {
    if(!w.workflowId) {
      continue;
    }
    if(workflowIds.has(w.workflowId)) {
      throw new Error(
        `Duplicate workflowId "${w.workflowId}" found in workflow ` +
        `configuration. Each workflowId must be unique.`
      );
    }
    workflowIds.set(w.workflowId, w);
  }

  // Warn on cross-collisions: workflowId matching another workflow's clientId
  for(const [wfId, owner] of workflowIds) {
    const collision = clientIds.get(wfId);
    if(collision && collision !== owner) {
      logger.warning(
        `Workflow "${owner.clientId}" has workflowId "${wfId}" which ` +
        `matches the clientId of another workflow. The clientId match ` +
        `will take precedence; the workflowId will be unreachable for ` +
        `that identifier.`
      );
    }
  }
}

/**
 * Warns when any workflow has OIDC settings but no id_token signing key.
 *
 * @param {object} opencredConfig - Parsed OpenCred config.
 */
function checkOidcKeyConfiguration(opencredConfig) {
  const hasOidcWorkflow = opencredConfig.workflows?.some(
    w => getRegisteredRedirectUris({workflow: w}).length > 0 || w.oidc?.claims
  );

  const hasIdTokenKey = opencredConfig.signingKeys?.some(
    k => k.purpose?.includes('id_token')
  );

  if(hasOidcWorkflow && !hasIdTokenKey) {
    logger.warning(
      'One or more workflows have OIDC configuration (oidc.redirectUri or ' +
      'oidc.claims) but no signing key with id_token purpose is configured. ' +
      'The OIDC token endpoint will fail until you add a key with ' +
      'purpose: ["id_token"] to opencred.signingKeys.'
    );
  }
}

bedrock.events.on('bedrock.init', async () => {
  // After Bedrock has loaded config from env or file, validate config
  // and apply defaults and presets.
  const {opencred} = config;
  const workflows = opencred?.workflows ?? [];

  opencred.defaultLanguage = opencred.defaultLanguage ?? 'en';
  opencred.translations = combineTranslations(opencred.translations ?? {});

  // A list of verification use cases for this OpenCred instance
  opencred.workflows = workflows.map(
    workflow => applyWorkflowDefaults({
      opencred, workflows, workflow})
  ).filter(Boolean);

  try {
    ensureAccessTokenKey(opencred);

    config.opencred = OpenCredConfigSchema.parse(opencred);
    // schema parsing replaces `config.opencred` with a new object that only
    // has schema-declared fields; derived config must be reattached here
    config.opencred.authorization = buildAuthorizationConfig({
      workflows: config.opencred.workflows
    });
    validateWorkflowIdentifiers(config.opencred);
    logger.info('OpenCred Config Successfully Validated.');

    checkOidcKeyConfiguration(config.opencred);

    // Check DC API availability and log status
    if(!isDcApiAvailable(config.opencred)) {
      logger.warning(
        'DC API support is disabled: caStore is not configured. ' +
        'DC API requires at least one certificate in opencred.caStore.'
      );
    } else {
      logger.info('DC API support is enabled: caStore is configured.');
    }
  } catch(error) {
    if(error instanceof ZodError) {
      logger.error(JSON.stringify(error.issues, null, 2));
      throw new bedrock.util.BedrockError(
        'OpenCred configuration validation failed. See logs for details.',
        {
          name: 'ConfigurationError',
          details: {validationErrors: error.issues.map(issue => issue.message)}
        }
      );
    }
    // Re-throw non-ZodError errors as-is
    throw error;
  }
});
