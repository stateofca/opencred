/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// How long to wait for `navigator.credentials.get` to settle before
// treating it as a non-responsive environment (no wallet/credential
// provider ever answered) rather than an in-progress user interaction.
const DC_API_TIMEOUT_MS = 30000;

/**
 * Fetch a ready-to-send DC API wire envelope for each requested profile.
 *
 * One HTTP call carries every profile, as a repeated `profile` parameter. The
 * server builds them together and stores a pending request per profile, so the
 * wallet's eventual response can be verified against whichever request it
 * answered. Fetching them one at a time would instead leave each request
 * overwriting the last, and would spend several network round trips inside the
 * transient user activation that `navigator.credentials.get` requires.
 *
 * The client stays profile-agnostic: it never inspects a protocol identifier,
 * decodes a JWT, or reshapes a payload per profile.
 *
 * @param {object} options - Options.
 * @param {object} options.exchangeData - Exchange data, providing
 *   `dcApi.authorizationRequestUrl` and `accessToken`.
 * @param {object} options.httpClient - HTTP client instance.
 * @param {Array<string>} options.profiles - Profiles to request, in the order
 *   they should appear in the DC API `requests` array. Order can determine
 *   which handler the OS offers first, and which format a wallet that reads
 *   several answers with.
 * @returns {Promise<Array<{profile: string, dcApiRequest: object}>>} One
 *   envelope per profile, in requested order.
 */
export async function fetchDcApiRequests({
  exchangeData, httpClient, profiles
} = {}) {
  if(!exchangeData || !exchangeData.id || !exchangeData.workflowId) {
    throw new Error('Exchange data is required');
  }
  if(!httpClient) {
    throw new Error('HTTP client is required');
  }
  if(!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error('At least one profile is required');
  }

  const authorizationRequestUrl =
    exchangeData.dcApi?.authorizationRequestUrl;
  if(!authorizationRequestUrl) {
    throw new Error(
      'Exchange is missing `dcApi.authorizationRequestUrl`');
  }

  const url = new URL(authorizationRequestUrl, window.location.origin);
  for(const profile of profiles) {
    url.searchParams.append('profile', profile);
  }

  const {data} = await httpClient.get(url.pathname + url.search, {
    headers: {
      Authorization: `Bearer ${exchangeData.accessToken}`
    }
  });

  // A single-profile request also returns the plural form; the singular
  // `dcApiRequest` is kept only for older clients.
  const dcApiRequests = data?.dcApiRequests;
  if(Array.isArray(dcApiRequests) && dcApiRequests.length > 0) {
    return dcApiRequests;
  }
  if(data?.dcApiRequest && typeof data.dcApiRequest === 'object') {
    return [{profile: profiles[0], dcApiRequest: data.dcApiRequest}];
  }
  throw new Error(
    'Authorization request response missing `dcApiRequests` envelopes');
}

/**
 * Ask the platform for a digital credential, passing every request at once.
 *
 * Each wallet answers the request it understands: Google Wallet the OID4VP 1.0
 * one, Apple Wallet the ISO 18013-7 Annex C one, and a wallet that reads either
 * may answer either.
 *
 * Rejections are annotated rather than translated, so the caller can tell a
 * client-side timeout from a genuine browser or OS cancellation.
 *
 * @param {object} options - Options.
 * @param {Array<object>} options.requests - DC API request envelopes
 *   (`{protocol, data}`), in the order they should be offered.
 * @param {number} [options.timeoutMs] - How long to wait before treating the
 *   environment as non-responsive.
 * @returns {Promise<object>} The platform's credential response.
 */
export async function requestDigitalCredential({
  requests, timeoutMs = DC_API_TIMEOUT_MS
} = {}) {
  if(!Array.isArray(requests) || requests.length === 0) {
    throw new Error('At least one DC API request is required');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const credentialResponse = await navigator.credentials.get({
      signal: controller.signal,
      mediation: 'required',
      digital: {requests}
    });
    if(!credentialResponse) {
      throw new Error('No credential was provided');
    }
    return credentialResponse;
  } catch(error) {
    // Distinguishes our own abort from a user or platform one, which the
    // caller reports differently and surfaces with different wording.
    if(timedOut) {
      error.isDcApiTimeout = true;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Post a wallet's raw response back for the server to unwrap and verify.
 *
 * The response is forwarded unaltered. `profile` is sent only as a hint for
 * diagnostics: the server routes the response to its pending request by DC API
 * protocol identifier and never lets a client-supplied profile override that.
 *
 * @param {object} options - Options.
 * @param {object} options.exchangeData - Exchange data.
 * @param {object} options.httpClient - HTTP client instance.
 * @param {object} options.credentialResponse - The platform's response.
 * @param {string} [options.profile] - Profile the client believes answered.
 * @returns {Promise<object>} The server's result.
 */
export async function submitDcApiResponse({
  exchangeData, httpClient, credentialResponse, profile
} = {}) {
  const responseUrl =
    `/workflows/${exchangeData.workflowId}` +
    `/exchanges/${exchangeData.id}` +
    `/openid/client/authorization/response` +
    (profile ? `?profile=${encodeURIComponent(profile)}` : '');

  const {data} = await httpClient.post(responseUrl, {
    json: credentialResponse,
    headers: {
      Authorization: `Bearer ${exchangeData.accessToken}`
    }
  });
  return data;
}

/**
 * Best-effort, non-blocking report of a DC API outcome that never reaches
 * the server through any other route (`navigator.credentials.get`
 * cancellation, error, or client-side timeout). A beacon failure must never
 * throw or otherwise change the user-facing error already surfaced from the
 * calling catch block.
 *
 * Reports the whole set of profiles that were offered, not one of them: when
 * the platform sheet is dismissed, *no* profile answered, so naming one would
 * be a fabrication. The singular `profile` is included only when exactly one
 * was offered, so existing single-profile reporting is unchanged.
 *
 * @param {object} options - Options for the beacon.
 * @param {object} options.exchangeData - The exchange data object.
 * @param {object} options.httpClient - HTTP client instance.
 * @param {Array<string>} options.profiles - The profiles that were offered.
 * @param {Error} options.error - The error thrown by
 *   `navigator.credentials.get`.
 * @param {boolean} [options.timedOut] - True if this rejection was caused
 *   by our own timeout-triggered `controller.abort()`, not a genuine
 *   browser/OS-level cancellation or error.
 * @returns {Promise<void>}
 */
async function reportDcApiOutcome({
  exchangeData, httpClient, profiles, error, timedOut
}) {
  try {
    const url =
      `/workflows/${exchangeData.workflowId}` +
      `/exchanges/${exchangeData.id}` +
      `/events`;
    const type = timedOut ? 'dcapi_timeout' :
      error.name === 'NotAllowedError' ? 'dcapi_cancelled' : 'dcapi_error';
    await httpClient.post(url, {
      json: {
        type,
        profiles,
        ...(profiles.length === 1 ? {profile: profiles[0]} : {}),
        ...(timedOut ? {timeoutMs: DC_API_TIMEOUT_MS} : {errorName: error.name})
      },
      headers: {
        Authorization: `Bearer ${exchangeData.accessToken}`
      }
    });
  } catch {
    // best-effort telemetry; never surface a beacon failure to the user
  }
}

/**
 * Run a DC API presentation for one or more profiles.
 *
 * Fetches every requested envelope in one call, offers them all to the platform
 * in a single `navigator.credentials.get`, and posts whichever response comes
 * back for the server to verify against the request it answered.
 *
 * If `navigator.credentials.get` rejects (user cancelled or a wallet/browser
 * error), that outcome is reported to the server via a best-effort beacon
 * (`POST .../events`) before re-throwing, since otherwise it would never reach
 * the server through any other route.
 *
 * @param {object} options - Options for the DC API flow.
 * @param {object} options.exchangeData - The exchange data object.
 * @param {object} options.httpClient - HTTP client instance.
 * @param {Array<string>} options.profiles - Profiles to offer together, in
 *   order.
 * @param {Function} [options.onExchangeUpdate] - Callback when the exchange is
 *   updated.
 * @returns {Promise<object>} The server's result.
 */
export async function startDcApiFlow({
  exchangeData,
  httpClient,
  profiles,
  onExchangeUpdate
} = {}) {
  try {
    const envelopes = await fetchDcApiRequests({
      exchangeData, httpClient, profiles
    });

    let credentialResponse;
    try {
      credentialResponse = await requestDigitalCredential({
        requests: envelopes.map(e => e.dcApiRequest)
      });
    } catch(navigatorError) {
      await reportDcApiOutcome({
        exchangeData,
        httpClient,
        profiles: envelopes.map(e => e.profile),
        error: navigatorError,
        timedOut: navigatorError.isDcApiTimeout === true
      });
      throw navigatorError;
    }

    // The platform does not say which request was answered, so match the
    // response protocol back to the envelope that used it. Only a diagnostic
    // hint — the server does its own authoritative matching — so an
    // unrecognized protocol is left unattributed rather than guessed at.
    const answered = envelopes.find(
      e => e.dcApiRequest?.protocol === credentialResponse.protocol);

    const result = await submitDcApiResponse({
      exchangeData,
      httpClient,
      credentialResponse,
      profile: answered?.profile
    });

    if(result?.exchange && onExchangeUpdate) {
      onExchangeUpdate(result.exchange);
    }

    return result;
  } catch(error) {
    if(error.isDcApiTimeout) {
      throw new Error(
        'Your wallet app did not respond. Try again or use another ' +
        'connection method.');
    } else if(error.name === 'NotAllowedError') {
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
