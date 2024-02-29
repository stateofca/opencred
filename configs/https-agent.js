/*!
 * Copyright (c) 2023-2024 Digital Bazaar, Inc.
 */
import {config} from '@bedrock/core';

// allow self-signed certificates in dev
config['https-agent'].rejectUnauthorized = false;
