/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const applyRpDefaults = (allRps, rp, refs = []) => {
  if(rp.workflow) {
    const {untrustedVariableAllowList} = rp.workflow;
    rp.workflow.untrustedVariableAllowList =
      untrustedVariableAllowList ? [...new Set([
        ...untrustedVariableAllowList,
        'redirectPath'
      ])] : ['redirectPath'];
  }
  if(rp.configFrom) {
    if(typeof rp.configFrom !== 'string') {
      throw new Error(`[${rp.clientId}]: configFrom must be a string`);
    }
    const configFrom = allRps.find(r => r.clientId === rp.configFrom);
    if(!configFrom) {
      throw new Error(
        `[${rp.clientId}]: configFrom client ${rp.configFrom} not found`
      );
    }
    if(configFrom.configFrom && refs.includes(configFrom.clientId)) {
      throw new Error(
        `[${rp.clientId}]: Circular configFrom reference detected`
      );
    } else if(configFrom.configFrom) {
      return {
        ...applyRpDefaults(allRps, configFrom, refs.concat(rp.clientId)),
        ...rp
      };
    }
    return {
      ...configFrom,
      ...rp
    };
  }
  return rp;
};
