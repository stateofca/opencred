/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  checkTwdiwStatusList2021, TWDIW_STATUS_LIST_2021_ENTRY_TYPE
} from './twdiw-status-list-2021.js';
import {
  checkStatus as checkStatusBitstring
} from '@digitalbazaar/vc-bitstring-status-list';

const BITSTRING_STATUS_LIST_ENTRY_TYPE = 'BitstringStatusListEntry';

/**
 * Routes a credential's status check to the correct handler.
 *
 * `BitstringStatusListEntry` credentials are delegated to
 * `@digitalbazaar/vc-bitstring-status-list`. `StatusList2021Entry` credentials
 * are handled by the non-standard, deprecated TWDIW handler ONLY when
 * `twdiwStatusList2021Enabled` is set; otherwise that type is rejected as an
 * unsupported status entry type (fail-closed), protecting the normal flow from
 * the TWDIW-specific trust model.
 *
 * @param {object} options - Options (forwarded to the chosen handler).
 * @param {object} options.credential - The credential being checked.
 * @param {boolean} [options.twdiwStatusList2021Enabled] - Enables the TWDIW
 *   StatusList2021 handler for this check. Defaults to `false`.
 * @returns {Promise<object>} A `{verified, errors?}` status result.
 */
export const checkStatus = async options => {
  const {credential, twdiwStatusList2021Enabled = false} = options;
  const statuses = arrayOf(credential?.credentialStatus);
  if(!statuses.length) {
    return {verified: true};
  }
  const statusEntryTypes = statuses.map(status => arrayOf(status.type)).flat();
  const supportedTypes = [BITSTRING_STATUS_LIST_ENTRY_TYPE];
  if(twdiwStatusList2021Enabled) {
    supportedTypes.push(TWDIW_STATUS_LIST_2021_ENTRY_TYPE);
  }
  const unsupported = statusEntryTypes.filter(
    tt => !supportedTypes.includes(tt));
  if(unsupported.length) {
    return {
      verified: false,
      errors: [`Unsupported status entry type(s): ${unsupported.join(', ')}`]
    };
  }
  if(statusEntryTypes.includes(TWDIW_STATUS_LIST_2021_ENTRY_TYPE)) {
    return checkTwdiwStatusList2021(options);
  }
  return checkStatusBitstring(options);
};

function arrayOf(value) {
  if(Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}
