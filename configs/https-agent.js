/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {config} from '@bedrock/core';
import '@bedrock/https-agent';

// allow self-signed certificates in dev
config['https-agent'].rejectUnauthorized = false;
