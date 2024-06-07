/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import * as bedrock from '@bedrock/core';
import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const {config} = bedrock;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const configPath = path.join(__dirname, 'configs/combined.yaml');
  console.log('Loading config from ' + configPath);
  const localConfig = fs.readFileSync(configPath, 'utf8');
  const based = Buffer.from(localConfig).toString('base64');
  process.env.BEDROCK_CONFIG = based;
  console.log(based.slice(0, 40));
} catch(e) {
  console.log('Failed to load a local config.');
}

config.paths.config = path.join(__dirname, 'configs');
import './lib/index.js';

bedrock.start();
