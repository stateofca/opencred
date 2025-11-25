/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {defaultDocLoader} from './documentLoader.js';
import {SUITES} from './suites.js';
import {verifyUtils} from './utils.js';

/**
 * Verify an LDP VerifiablePresentation and its contained credential
 * @param {object} options
 * @param {object} options.presentation - The VerifiablePresentation object
 * @param {object} options.exchange - The exchange object
 * @param {function} options.vcQuery - Optional function to extract VC from VP
 * @param {function} options.documentLoader - Document loader function
 * @returns {object} - {verified, errors, verifiablePresentation, vc}
 */
export async function verifyLdpPresentation({
  presentation, exchange, vcQuery, documentLoader
}) {
  const errors = [];
  let verified = false;
  const loader = documentLoader ?? defaultDocLoader;

  if(!presentation) {
    errors.push('Presentation is required');
    return {errors, verified, verifiablePresentation: null, vc: null};
  }

  const vpResult = await verifyUtils.verifyPresentationDataIntegrity({
    presentation,
    documentLoader: loader,
    suite: SUITES,
    challenge: exchange.challenge,
    checkStatus: verifyUtils.checkStatus
  });
  verified = vpResult.verified;
  if(!vpResult.verified) {
    const errorMsg = vpResult.error;
    errors.push(Array.isArray(errorMsg) ? errorMsg.join(', ') : errorMsg);
  }

  const vc = vcQuery ?
    vcQuery(presentation) : presentation.verifiableCredential[0];
  if(!vc) {
    errors.push('No verifiable credential found in presentation');
    verified = false;
    return {errors, verified, verifiablePresentation: presentation, vc: null};
  }

  const result = vc.id ? vpResult.credentialResults?.find(
    cr => cr.credentialId === vc.id
  ) : vpResult.credentialResults?.[0];
  if(!result || !result.verified) {
    const errorMsg = result?.error;
    errors.push(Array.isArray(errorMsg) ? errorMsg.join(', ') : errorMsg ||
      'Credential verification failed');
    verified = false;
  }

  return {errors, verified, verifiablePresentation: presentation, vc};
}

