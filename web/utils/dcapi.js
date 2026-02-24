/*!
 * Copyright 2023 - 2025 California Department of Motor Vehicles
 * Copyright 2023 - 2025 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Starts the DC API flow by requesting authorization and using
 *   navigator.credentials.get.
 *
 * @param {object} options - Options for the DC API flow.
 * @param {object} options.exchangeData - The exchange data object.
 * @param {object} options.httpClient - HTTP client instance.
 * @param {Function} options.onExchangeUpdate - Callback when
 *   the exchange is updated.
 * @param options.selectedProtocol
 * @param {string} [options.clientIdScheme] - Client ID scheme to use
 *   (e.g., 'x509_san_dns' or 'did').
 * @returns {Promise<void>}
 */
export async function startDCApiFlow({
  exchangeData,
  httpClient,
  onExchangeUpdate,
  selectedProtocol,
  clientIdScheme
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
    // Add client_id_scheme query parameter if provided
    if(clientIdScheme) {
      urlObj.searchParams.set('client_id_scheme', clientIdScheme);
    }
    const requestUrlWithResponseMethod = urlObj.pathname + urlObj.search;

    // Determine if this is an Annex C request (returns JSON) or
    // Annex D (returns JWT text)
    const isAnnexC = selectedProtocol === '18013-7-Annex-C';

    // Configure response handling based on request type
    const requestOptions = {
      headers: {
        Authorization: `Bearer ${exchangeData.accessToken}`
      }
    };

    if(isAnnexC) {
      // Annex C returns JSON, so request JSON response
      requestOptions.responseType = 'json';
    } else {
      // Annex D returns JWT as text
      requestOptions.responseType = 'text';
    }

    const response = await httpClient.get(
      requestUrlWithResponseMethod, requestOptions);

    // Handle response based on type
    let jwt;
    let annexCData;
    if(isAnnexC) {
      // Annex C: response.data contains the JSON object with
      // deviceRequest and encryptionInfo
      annexCData = response.data;
      if(!annexCData?.deviceRequest || !annexCData?.encryptionInfo) {
        throw new Error(
          'Annex C response missing required fields: ' +
          'deviceRequest or encryptionInfo'
        );
      }
    } else {
      // Annex D: response is text (JWT string)
      // If responseType: 'text' was set, the httpClient might have
      // already parsed it
      // Check if response has a .text() method or if it's already a string
      if(typeof response === 'string') {
        jwt = response;
      } else if(response.text && typeof response.text === 'function') {
        jwt = await response.text();
      } else if(response.data) {
        jwt = response.data;
      } else {
        throw new Error('Unable to extract JWT from response');
      }
    }

    // Use the Digital Credentials API to get credentials
    const controller = new AbortController();

    // Build request structure based on request type
    let credentialRequest;
    if(isAnnexC) {
      // Annex C uses protocol "org-iso-mdoc" with deviceRequest and
      // encryptionInfo
      credentialRequest = {
        protocol: 'org-iso-mdoc',
        data: {
          deviceRequest: annexCData.deviceRequest,
          encryptionInfo: annexCData.encryptionInfo
        }
      };
    } else {
      // Annex D uses protocol "openid4vp" with JWT request
      credentialRequest = {
        protocol: 'openid4vp',
        data: {
          request: jwt
        }
      };
    }

    const credentialResponse = await navigator.credentials.get({
      signal: controller.signal,
      mediation: 'required',
      digital: {
        requests: [credentialRequest]
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
