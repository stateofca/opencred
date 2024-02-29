/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import '@bedrock/core';

import '@bedrock/express';
import '@bedrock/views';
import '@bedrock/webpack';
import '@bedrock/health';
import '@bedrock/express-browser-fixes';
import '@bedrock/health';
import '@bedrock/server';

// validate and load config
import '../configs/config.js';

import './api.js';
import './http.js';
import './database.js';

// this should always be the last import
import '@bedrock/config-yaml';
