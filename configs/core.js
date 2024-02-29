/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';

// core configuration
config.core.workers = 1;
config.core.primary.title = 'opencred';
config.core.worker.title = 'opencred-worker';
config.core.worker.restart = false;
