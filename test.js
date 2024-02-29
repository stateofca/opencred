/*!
 * Copyright (c) 2024 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const {config} = bedrock;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

config.paths.config = path.join(__dirname, 'configs');
import './lib/index.js';

import '@bedrock/test';

bedrock.start();
