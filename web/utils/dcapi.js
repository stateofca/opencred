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
 * @param {string} options.profile - OID4VP profile to use
 *   (e.g., 'OID4VP-combined', 'OID4VP-draft18', 'OID4VP-1.0')
 * @returns {Promise<void>}
 */
export async function startDCApiFlow({
  exchangeData,
  httpClient,
  onExchangeUpdate,
  profile
} = {}) {
  if(!exchangeData || !exchangeData.id || !exchangeData.workflowId) {
    throw new Error('Exchange data is required');
  }

  if(!httpClient) {
    throw new Error('HTTP client is required');
  }

  try {
    // Get the authorization request from the server
    let requestUrl =
      `/workflows/${exchangeData.workflowId}` +
      `/exchanges/${exchangeData.id}` +
      `/dcapi/request`;

    // Append profile query parameter if provided
    if(profile) {
      requestUrl += `?profile=${encodeURIComponent(profile)}`;
    }

    const {data: requests} = await httpClient.get(requestUrl, {
      headers: {
        Authorization: `Bearer ${exchangeData.accessToken}`
      }
    });

    if(!requests) {
      throw new Error('No authorization request received from server');
    }

    // Use the Digital Credentials API to get credentials
    const controller = new AbortController();

    const credentialResponse = await navigator.credentials.get({
      signal: controller.signal,
      mediation: 'required',
      digital: requests
    });

    console.log('Credential response:', credentialResponse);

    if(!credentialResponse) {
      throw new Error('No credential was provided');
    }

    // Send the response back to the server
    const responseUrl =
      `/workflows/${exchangeData.workflowId}` +
      `/exchanges/${exchangeData.id}` +
      `/dcapi/response`;

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
