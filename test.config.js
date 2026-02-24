/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import '@bedrock/https-agent';
import '@bedrock/mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config.mocha.tests.push(path.join(__dirname, 'test', 'bedrock'));

// Bail out on first failure to focus on one test at a time
// because many subsequent failures are related to inability to
// set up test mocks/stubs after a first failure.
// Run with `npm run test:bail` to use.
config.mocha.options.bail = (process.env.MOCHA_BAIL == 'true');

// mongodb config
config.mongodb.name = 'opencred_test';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
// drop all collections on initialization
config.mongodb.dropCollections = {};
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = ['Exchanges'];

// HTTPS Agent
config['https-agent'].rejectUnauthorized = false;

// OpenCred default options for tests
if(!config.opencred) {
  config.opencred = {};
}
config.opencred.options = {
  exchangeProtocols: ['openid4vp', 'chapi'],
  recordExpiresDurationMs: 86400000, // 1 day
  exchangeTtlSeconds: 900, // 15 minutes
  includeQRByDefault: false,
  OID4VPdefault: undefined
};
