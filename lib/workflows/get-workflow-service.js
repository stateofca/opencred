/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseWorkflowService} from './base.js';
import {
  EntraVerifiedIdWorkflowService
} from './entra-verified-id-workflow.js';
import {NativeWorkflowService} from './native-workflow.js';
import {VCApiWorkflowService} from './vc-api-workflow.js';

// Create workflow service instances
const baseWorkflowService = new BaseWorkflowService();
const nativeWorkflowService = new NativeWorkflowService();
const entraWorkflowService = new EntraVerifiedIdWorkflowService();
const vcApiWorkflowService = new VCApiWorkflowService();

/**
* Get the appropriate workflow service based on type.
*
* @param {object} options - Options object.
* @param {string} options.type - The workflow type.
* @returns {BaseWorkflowService} - The workflow service instance.
*/
export const getWorkflowService = ({type}) => {
  switch(type) {
    case 'vc-api':
      return vcApiWorkflowService;
    case 'microsoft-entra-verified-id':
      return entraWorkflowService;
    case 'native':
      return nativeWorkflowService;
    default:
      return baseWorkflowService;
  }
};
