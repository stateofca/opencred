/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Generate LCW deep link URL for vcapi protocol.
 *
 * @param {object} options - Options object.
 * @param {object} options.exchange - Exchange object with protocols property.
 * @returns {string|null} Deep link URL or null if vcapi URL not available.
 */
function lcwVcapiDeepLink({exchange}) {
  const vcapiUrl = exchange?.protocols?.vcapi;
  if(!vcapiUrl) {
    return null;
  }

  // Construct Wallet API message in the format expected by LCW
  const walletApiMessage = {
    protocols: {
      vcapi: vcapiUrl
    }
  };

  // Construct LCW deep link with JSON-encoded request parameter
  const requestParam = encodeURIComponent(JSON.stringify(walletApiMessage));
  return `https://lcw.app/request?request=${requestParam}`;
}

/**
 * Generate CHAPI request object for web credential request.
 * This constructs a VerifiablePresentationRequest with QueryByExample.
 *
 * @param {object} options - Options object.
 * @param {object} options.exchange - Exchange object.
 * @returns {object|null} CHAPI request object or null if exchange unavailable.
 */
function lcwChapiRequest({exchange}) {
  // For CHAPI, we need to construct a web credential request
  // The actual query details should come from the exchange/workflow
  // This is a basic structure that can be populated with exchange data
  if(!exchange) {
    return null;
  }

  // Basic CHAPI request structure
  // TODO: replace this with query details specific to the requested credential
  // from the exchange participation endpoint.
  return {
    web: {
      VerifiablePresentation: {
        query: [{
          type: 'QueryByExample',
          credentialQuery: {
            reason: 'Please present your credential to continue.',
            example: {
              '@context': [
                'https://www.w3.org/2018/credentials/v1',
                'https://www.w3.org/2018/credentials/examples/v1'
              ],
              type: ['VerifiableCredential']
            }
          }
        }]
      }
    }
  };
}

export const lcwWallet = {
  id: 'lcw',
  name: 'Learner Credential Wallet',
  description: 'An open source mobile wallet developed by the Digital ' +
    'Credentials Consortium, a network of leading international ' +
    'universities designing an open infrastructure for academic credentials.',
  supportedFormats: ['ldp_vc'],
  supportedProtocols: {
    vcapi: {
      qr: {
        description: 'Select the plus button in the main menu and then ' +
          'select scan QR code.',
        formats: ['ldp_vc'],
        getUrl: lcwVcapiDeepLink
      },
      link: {
        description: 'Click the button to open your wallet app',
        formats: ['ldp_vc'],
        getUrl: lcwVcapiDeepLink
      },
      copy: {
        description: 'Copy the link to open in Learner Credential Wallet',
        formats: ['ldp_vc'],
        getUrl: lcwVcapiDeepLink
      }
    },
    chapi: {
      chapi: {
        description: 'Use your browser\'s credential handler to present ' +
          'credentials.',
        formats: ['ldp_vc'],
        getRequest: lcwChapiRequest
      }
    }
  }
};
