/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  checkStatusList2021, STATUS_LIST_2021_ENTRY_TYPE
} from './status-list-2021.js';
import {
  checkStatus as checkStatusBitstring
} from '@digitalbazaar/vc-bitstring-status-list';

const SUPPORTED_STATUS_ENTRY_TYPES = [
  'BitstringStatusListEntry',
  STATUS_LIST_2021_ENTRY_TYPE
];

/**
 * Routes a credential's status check to the correct handler.
 *
 * Credentials with a `StatusList2021Entry` status go to the local
 * StatusList2021 handler; all other (supported) status types are delegated to
 * `@digitalbazaar/vc-bitstring-status-list`.
 *
 * @param {object} options - Options (forwarded to the chosen handler).
 * @param {object} options.credential - The credential being checked.
 * @returns {Promise<object>} A `{verified, errors?}` status result.
 */
export const checkStatus = async options => {
  const {credential} = options;
  const statuses = arrayOf(credential?.credentialStatus);
  if(!statuses.length) {
    return {verified: true};
  }
  const statusEntryTypes = statuses.map(status => arrayOf(status.type)).flat();
  const unsupported = statusEntryTypes.filter(
    tt => !SUPPORTED_STATUS_ENTRY_TYPES.includes(tt));
  if(unsupported.length) {
    return {
      verified: false,
      errors: [`Unsupported status entry type(s): ${unsupported.join(', ')}`]
    };
  }
  if(statusEntryTypes.includes(STATUS_LIST_2021_ENTRY_TYPE)) {
    return checkStatusList2021(options);
  }
  return checkStatusBitstring(options);
};

function arrayOf(value) {
  if(Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}
