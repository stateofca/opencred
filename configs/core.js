/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';

// core configuration
config.core.workers = 1;
config.core.primary.title = 'opencred';
config.core.worker.title = 'opencred-worker';
config.core.worker.restart = false;
