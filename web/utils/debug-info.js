/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

const WORKFLOW_REQUEST_FIELDS = [
  'dcql_query',
  'presentationDefinition',
  'presentation_definition',
  'query',
  'verifiablePresentationRequest',
  'vpr'
];

const WORKFLOW_SUMMARY_FIELDS = [
  'clientId',
  'configFrom',
  'dcApiEnabled',
  'description',
  'interactEnabled',
  'name',
  'public',
  'type'
];

const PICKER_ENTRY_FIELDS = [
  'available',
  'method',
  'name',
  'profile',
  'walletId',
  'walletIds'
];

/**
 * Returns a shallow copy of the workflow object without the
 * `translations` property. Does not mutate the original.
 *
 * @param {object} options - Options hashmap.
 * @param {object} options.workflow - The workflow object.
 * @returns {object} Workflow copy without translations.
 */
export function omitWorkflowTranslations({workflow} = {}) {
  if(!workflow || typeof workflow !== 'object') {
    return {};
  }
  const copy = {...workflow};
  delete copy.translations;
  return copy;
}

/**
 * Extracts workflow request/query fields that should be
 * displayed as full JSON. Returns an object containing only
 * the fields that are present in the workflow.
 *
 * @param {object} options - Options hashmap.
 * @param {object} options.workflow - The workflow object.
 * @returns {object} Object with present request fields.
 */
export function getWorkflowRequestJson({workflow} = {}) {
  if(!workflow || typeof workflow !== 'object') {
    return {};
  }
  const result = {};
  for(const field of WORKFLOW_REQUEST_FIELDS) {
    if(workflow[field] !== undefined) {
      result[field] = workflow[field];
    }
  }
  return result;
}

/**
 * Builds compact label/value rows for scalar workflow
 * fields, excluding translations and query payloads.
 *
 * @param {object} options - Options hashmap.
 * @param {object} options.workflow - The workflow object.
 * @returns {Array<{label: string, value: *}>} Summary rows.
 */
export function summarizeWorkflow({workflow} = {}) {
  if(!workflow || typeof workflow !== 'object') {
    return [];
  }
  const rows = [];
  for(const key of WORKFLOW_SUMMARY_FIELDS) {
    if(workflow[key] !== undefined) {
      rows.push({label: key, value: workflow[key]});
    }
  }
  const {brand} = workflow;
  if(brand && typeof brand === 'object') {
    if(brand.homeLink) {
      rows.push({
        label: 'brand.homeLink',
        value: brand.homeLink
      });
    }
    if(brand.primary) {
      rows.push({
        label: 'brand.primary',
        value: brand.primary
      });
    }
    if(brand.header) {
      rows.push({
        label: 'brand.header',
        value: brand.header
      });
    }
  }
  if(workflow.redirectUri) {
    rows.push({
      label: 'redirectUri',
      value: workflow.redirectUri
    });
  }
  return rows;
}

/**
 * Builds compact identification rows for picker entries.
 *
 * @param {object} options - Options hashmap.
 * @param {Array} options.pickerEntries - Picker entries.
 * @returns {Array<{label: string, values: object}>}
 *   Compact summary rows.
 */
export function summarizePickerEntries(
  {pickerEntries} = {}
) {
  if(!Array.isArray(pickerEntries)) {
    return [];
  }
  return pickerEntries.map((entry, i) => {
    const values = {};
    for(const f of PICKER_ENTRY_FIELDS) {
      if(entry[f] !== undefined) {
        values[f] = entry[f];
      }
    }
    return {
      label: entry.name || entry.method ||
        `entry ${i}`,
      values
    };
  });
}

/**
 * Builds compact flags from interaction state.
 *
 * @param {object} options - Options hashmap.
 * @param {object} options.interactionState - The
 *   interaction state object.
 * @returns {Array<{label: string, value: *}>}
 *   Compact summary rows.
 */
export function summarizeInteractionState(
  {interactionState} = {}
) {
  if(!interactionState ||
    typeof interactionState !== 'object') {
    return [];
  }
  const rows = [];
  if(interactionState.dcApiError !== undefined) {
    rows.push({
      label: 'dcApiError',
      value: interactionState.dcApiError
    });
  }
  if(interactionState.activeDescriptorId !== undefined &&
    interactionState.activeDescriptorId !== null) {
    rows.push({
      label: 'activeDescriptorId',
      value: interactionState.activeDescriptorId
    });
  }
  if(interactionState.activeOverride !== undefined) {
    rows.push({
      label: 'activeOverride',
      value: interactionState.activeOverride
    });
  }
  if(interactionState.activePickerEntryOverride !==
    undefined) {
    const override =
      interactionState.activePickerEntryOverride;
    rows.push({
      label: 'activePickerEntryOverride',
      value: override !== null
    });
  }
  return rows;
}
