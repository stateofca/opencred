/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Starts the DC API flow by fetching a ready-to-use OID4VP wire envelope
 * from the verifier server, dispatching it to the wallet via
 * `navigator.credentials.get`, then posting the wallet's raw response back
 * to the server.
 *
 * The client is profile-agnostic: it never inspects the OID4VP protocol
 * identifier, decodes any JWT, or reshapes payloads per profile. The
 * server's authorization-request endpoint returns
 * `{ dcApiRequest: { protocol, data } }` — the exact envelope the W3C
 * Digital Credentials API expects — and the wallet response is forwarded
 * back unaltered for the server to unwrap.
 *
 * @param {object} options - Options for the DC API flow.
 * @param {object} options.exchangeData - The exchange data object.
 * @param {object} options.httpClient - HTTP client instance.
 * @param {Function} options.onExchangeUpdate - Callback when
 *   the exchange is updated.
 * @param {string} options.selectedProtocol - The selected protocol ID
 *   (used only to look up the authorization-request URL in
 *   `exchangeData.protocols`; not interpreted further).
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

  if(!selectedProtocol) {
    throw new Error('selectedProtocol is required');
  }

  try {
    const protocolUrl = exchangeData.protocols?.[selectedProtocol];
    if(!protocolUrl) {
      throw new Error(
        `Protocol "${selectedProtocol}" not found in exchange protocols`);
    }

    const url = new URL(protocolUrl);
    const requestUri = url.searchParams.get('request_uri');

    if(!requestUri) {
      throw new Error('request_uri parameter not found in protocol URL');
    }

    const requestUrl = decodeURIComponent(requestUri);
    const urlObj = new URL(requestUrl, window.location.origin);
    const authzReqPath = urlObj.pathname + urlObj.search;

    const {data} = await httpClient.get(authzReqPath, {
      headers: {
        Authorization: `Bearer ${exchangeData.accessToken}`
      }
    });

    const dcApiRequest = data?.dcApiRequest;
    if(!dcApiRequest || typeof dcApiRequest !== 'object') {
      throw new Error(
        'Authorization request response missing `dcApiRequest` envelope');
    }

    const controller = new AbortController();

    const credentialResponse = await navigator.credentials.get({
      signal: controller.signal,
      mediation: 'required',
      digital: {
        requests: [dcApiRequest]
      }
    });

    if(!credentialResponse) {
      throw new Error('No credential was provided');
    }

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

    if(result?.exchange && onExchangeUpdate) {
      onExchangeUpdate(result.exchange);
    }

    return result;
  } catch(error) {
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
