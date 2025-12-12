/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Starts the DC API flow by requesting authorization and using
 *   navigator.credentials.get
 * @param {Object} options - Options for the DC API flow
 * @param {Object} options.exchangeData - The exchange data object
 * @param {Object} options.httpClient - HTTP client instance
 * @param {Function} options.onExchangeUpdate - Callback when
 *   the exchange is updated
 * @returns {Promise<void>}
 */
export async function startDCApiFlow({
  exchangeData,
  httpClient,
  onExchangeUpdate,
  selectedProtocol
} = {}) {
  if(!exchangeData || !exchangeData.id || !exchangeData.workflowId) {
    throw new Error('Exchange data is required');
  }

  if(!httpClient) {
    throw new Error('HTTP client is required');
  }

  try {
    // Get the authorization request from the server using the OID4VP endpoint
    // with the selected profile
    // The protocol URL contains a request_uri parameter that needs extraction
    const protocolUrl = exchangeData.protocols[
      selectedProtocol ?? '18013-7-Annex-D'];

    // Parse the URL to extract the request_uri query parameter
    const url = new URL(protocolUrl);
    const requestUri = url.searchParams.get('request_uri');

    if(!requestUri) {
      throw new Error('request_uri parameter not found in protocol URL');
    }

    // Decode the URL-encoded request_uri
    const requestUrl = decodeURIComponent(requestUri);

    // Add responseMode query parameter for DC API
    // Use dc_api (unencrypted) for now;
    // can be changed to dc_api.jwt if encryption is needed
    const urlObj = new URL(requestUrl, window.location.origin);
    urlObj.searchParams.set('response_mode', 'dc_api');
    const requestUrlWithResponseMethod = urlObj.pathname + urlObj.search;

    // The response will be a JWT string with content-type
    // 'application/oauth-authz-req+jwt'
    const response = await httpClient.get(requestUrlWithResponseMethod, {
      headers: {
        Authorization: `Bearer ${exchangeData.accessToken}`
      },
      responseType: 'text' // Get response as text, not JSON
    });
    const jwt = await response.text();

    // Use the Digital Credentials API to get credentials
    const controller = new AbortController();

    const credentialResponse = await navigator.credentials.get({
      signal: controller.signal,
      mediation: 'required',
      digital: {
        requests: [{
          protocol: 'openid4vp',
          data: {
            request: jwt
          }
        }]
      }
    });

    console.log('Credential response:', credentialResponse);

    if(!credentialResponse) {
      throw new Error('No credential was provided');
    }

    // Send the response back to the server
    // Construct the response URL from the standard pattern
    const responseUrl =
      `/workflows/${exchangeData.workflowId}` +
      `/exchanges/${exchangeData.id}` +
      `/openid/client/authorization/response`;

    const {data: result} = await httpClient.post(responseUrl, {
      json: credentialResponse,
      headers: {
        Authorization: `Bearer ${exchangeData.accessToken}`
      }
    });

    // Update the exchange if needed
    if(result?.exchange && onExchangeUpdate) {
      onExchangeUpdate(result.exchange);
    }

    return result;
  } catch(error) {
    // Handle specific error types
    if(error.name === 'NotAllowedError') {
      throw new Error('The credential request was denied or cancelled.');
    } else if(error.name === 'AbortError') {
      throw new Error('The credential request was aborted.');
    } else if(error.message) {
      throw error;
    } else {
      throw new Error(
        'An error occurred during credential presentation.'
      );
    }
  }
}
