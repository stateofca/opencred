/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import * as bedrock from '@bedrock/core';
import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {logger} from './lib/logger.js';
import path from 'node:path';

const {config} = bedrock;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'configs/combined.yaml');

let localConfig = '';

if(!process.env.BEDROCK_CONFIG) {
  try {
    logger.info('Loading config from ' + configPath);
    localConfig = fs.readFileSync(configPath, 'utf8');
  } catch(e) {
    logger.warning('Failed to load config from ' + configPath);
  }
}

if(!!localConfig) {
  const based = Buffer.from(localConfig).toString('base64');
  process.env.BEDROCK_CONFIG = based;
  logger.info('Loaded config from ' + configPath);
}
config.paths.config = path.join(__dirname, 'configs');
import './lib/index.js';

bedrock.start();
