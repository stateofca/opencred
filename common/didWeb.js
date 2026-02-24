/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Converts configured domain to DID web format.
 *
 * @param {string} domain
 * @returns {string}
 */
export const domainToDidWeb = domain => {
  const didWeb = `did:web:${domain.replace(/^https?:\/\//, '')}`;
  return didWeb;
};

