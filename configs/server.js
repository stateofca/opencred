/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';
import '@bedrock/server';

// server info

config.express.fastifyOptions.trustProxy = true;
config.server.port = 22443;
config.server.httpPort = 22080;
// config.server.domain = 'slimy-chicken-matter.loca.lt';
config.server.bindAddr = ['0.0.0.0'];
