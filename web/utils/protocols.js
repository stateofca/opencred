/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PROTOCOLS_REGISTRY = {
  chapi: {
    name: 'CHAPI',
    description: 'A method for launching a wallet on the same device ' +
      'that works through your web browser.'
  },
  OID4VP: {
    name: 'OpenID for Verifiable Presentations',
    description: 'A method for websites to request credentials from ' +
      'digital wallets created by the OpenID Foundation'
  },
  'OID4VP-draft18': {
    name: 'OpenID for Verifiable Presentations - Draft 18',
    description: 'A pre-release version of OID4VP that used ' +
      'presentation exchange and input descriptors.'
  },
  'OID4VP-1.0': {
    name: 'OpenID for Verifiable Presentations 1.0',
    description: 'The 1.0 release of OID4VP, with DCQL Queries'
  },
  'OID4VP-combined': {
    name: 'OpenID for Verifiable Presentations - Combined',
    description: 'A cross-version edition of OID4VP that may be ' +
      'supported by wallets regardless of their version'
  },
  interact: {
    name: 'Interaction URL',
    description: 'A URL-based protocol for wallet interactions that ' +
      'supports cross-device exchanges. Copy the URL to your wallet app.'
  },
  vcapi: {
    name: 'VC-API',
    description: 'A Verifiable Credentials API endpoint for wallet ' +
      'interactions. Copy the URL to your wallet app.'
  },
  '18013-7-Annex-C': {
    name: 'ISO 18013-7-Annex-C',
    description: 'An emerging method for requesting ISO mDL driver' +
      'license credentials from a wallet on the same or different device.' +
      'Requires experimental Chrome flags enabled. (Apple/iOS devices)'
  },
  '18013-7-Annex-D': {
    name: 'ISO 18013-7-Annex-D',
    description: 'An emerging method for requesting ISO mDL driver' +
      'license credentials from a wallet on the same or different device.' +
      'Requires experimental Chrome flags enabled. (Android devices)'
  }
};
