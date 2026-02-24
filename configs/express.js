/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as bedrock from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import '@bedrock/express';

const {config} = bedrock;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.join(__dirname, '..');

// Configure static file serving for the web directory
// This allows app store button images and other static assets to be served
if(!config.express.static) {
  config.express.static = [];
}

// Add web directory to static file serving at root route
config.express.static.push({
  route: '/',
  path: path.join(rootPath, 'static')
});
