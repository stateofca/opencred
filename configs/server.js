/*!
 * Copyright (c) 2024 Digital Bazaar, Inc.
 */
import {config} from '@bedrock/core';
import '@bedrock/server';

// server info

config.express.httpOnly = true;
config.express.fastifyOptions.trustProxy = true;
config.server.port = 22443;
config.server.httpPort = 22080;
config.server.bindAddr = ['0.0.0.0'];
config.server.domain = 'localhost';
