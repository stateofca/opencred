/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {httpsUrlToDidUrl} from '@digitalbazaar/did-method-web';

/**
 * Converts configured domain to DID web format.
 *
 * Delegates to `httpsUrlToDidUrl` so the port colon is percent-encoded
 * and path segments become colon-separated, per the did:web spec.
 *
 * @param {string} domain - The HTTPS base URL to convert.
 * @returns {string} The DID web format string.
 */
export const domainToDidWeb = domain => httpsUrlToDidUrl(domain).did;
