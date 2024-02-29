/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
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
