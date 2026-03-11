/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {arrayOf} from './utils.js';
import {defaultDocLoader} from './documentLoader.js';
import {SUITES} from './suites.js';
import {verifyUtils} from './utils.js';

/**
 * Safely extract an error message from various error-like values.
 *
 * @param {*} err - Error value (Error, object with message, string, etc.).
 * @returns {string|undefined} - Error message string or undefined.
 */
export function toErrorMessage(err) {
  if(err == null) {
    return undefined;
  }
  if(typeof err === 'string') {
    return err;
  }
  if(err instanceof Error) {
    return err.message;
  }
  if(typeof err?.message === 'string') {
    return err.message;
  }
  return undefined;
}

/**
 * Verify an LDP VerifiablePresentation and its contained credential.
 *
 * @param {object} options - Options for LDP VP verification.
 * @param {object} options.presentation - The VerifiablePresentation object.
 * @param {object} options.exchange - The exchange object.
 * @param {Function} options.vcQuery - Optional function to extract VC from VP.
 * @param {Function} options.documentLoader - Document loader function.
 * @returns {object} - {verified, errors, verifiablePresentation, vc}.
 */
export async function verifyLdpPresentation({
  presentation, exchange, vcQuery, documentLoader = defaultDocLoader
}) {
  const errors = [];
  let verified = false;

  if(!presentation) {
    errors.push('Presentation is required');
    return {errors, verified, verifiablePresentation: null, vc: null};
  }

  const vpResult = await verifyUtils.verifyPresentationDataIntegrity({
    presentation,
    documentLoader,
    suite: SUITES,
    challenge: exchange.challenge,
    checkStatus: verifyUtils.checkStatus
  });
  verified = vpResult.verified;
  if(!vpResult.verified) {
    let errorMsg;
    try {
      const vpErrors =
        verifyUtils.getVerifyPresentationDataIntegrityErrors(vpResult);
      errorMsg = vpErrors.filter(Boolean).join(', ');
    } catch {
      errorMsg = null;
    }
    errorMsg = errorMsg || vpResult.error?.errors?.map(e => toErrorMessage(e))
      .filter(Boolean).join(', ');
    if(typeof errorMsg === 'string' && errorMsg) {
      errors.push(errorMsg);
    } else {
      errors.push('Presentation verification failed');
    }
  }

  // The credential we are looking for is either the one that matches the query.
  // Future may call for better support for multi-credential presentations.
  const vc = vcQuery ?
    vcQuery(presentation) : arrayOf(presentation.verifiableCredential ?? [])[0];
  if(!vc) {
    errors.push('No verifiable credential found in presentation');
    verified = false;
    return {errors, verified, verifiablePresentation: presentation, vc: null};
  }

  // Credential verification errors are already captured above via
  // getVerifyPresentationDataIntegrityErrors when vpResult.verified is false.
  // If vpResult.verified is true, all credentials passed verification.

  return {errors, verified, verifiablePresentation: presentation, vc};
}

