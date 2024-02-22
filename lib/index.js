/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
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
