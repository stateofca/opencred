/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';=
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import '@bedrock/views';

import {applyWorkflowDefaults, OpenCredConfigSchema} from './configUtils.js';
import {combineTranslations} from './translation.js';
import {logger} from '../lib/logger.js';

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
  // After Bedrock has loaded config from env or file, validate config
  // and apply defaults and presets.
  const {opencred} = config;
  const {workflows} = opencred;

  opencred.defaultLanguage = opencred.defaultLanguage ?? 'en';
  opencred.translations = combineTranslations(opencred.translations ?? {});

  // A list of verification use cases for this OpenCred instance
  opencred.workflows = workflows.map(
    workflow => applyWorkflowDefaults({opencred, workflows, workflow}).filter(Boolean)
  );

  // TODO: catch and process errors.
  config.opencred = OpenCredConfigSchema.parse(opencred);

  logger.info('OpenCred Config Successfully Validated.');
});
