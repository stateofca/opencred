/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// How long to wait for `navigator.credentials.get` to settle before
// treating it as a non-responsive environment (no wallet/credential
// provider ever answered) rather than an in-progress user interaction.
// Set to 60s to give same-device flows time to finish (open wallet,
// authenticate, select a credential) before the client gives up; 30s
// cut off users who were still mid-interaction.
const DC_API_TIMEOUT_MS = 60000;

// Cap on each raw error text field (message, cause) forwarded in a beacon. The
// server enforces the same cap (lib/dcApiOutcomeFields.js), hashes the message,
// and logs the raw text only when `options.dcApiDiagnostics` is on.
const MAX_DC_API_TEXT_LENGTH = 1000;

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
 * client-side timeout from a genuine browser or OS cancellation. Each rejection
 * also carries `dcApiElapsedMs` and `dcApiContext` (see `_captureDcApiContext`)
 * for the outcome beacon.
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

  // Captured before the call: by the time it rejects, the activation and
  // focus state no longer describe what the platform saw.
  const context = _captureDcApiContext({requests});
  const startedAt = Date.now();

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
    // Diagnostics for the outcome beacon. A rejection that is not an object
    // (a bare string) cannot carry them.
    if(error && typeof error === 'object') {
      error.dcApiElapsedMs = Date.now() - startedAt;
      error.dcApiContext = context;
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
 * Best-effort, non-blocking POST of a DC API beacon (`.../events`) for an
 * outcome that never reaches the server through any other route: a
 * `navigator.credentials.get` cancellation, error, or client-side timeout, or
 * a failed envelope fetch or response submit. A beacon failure must never
 * throw or otherwise change the user-facing error already surfaced from the
 * calling catch block.
 *
 * @param {object} options - Options for the beacon.
 * @param {object} options.exchangeData - The exchange data object.
 * @param {object} options.httpClient - HTTP client instance.
 * @param {object} options.event - The beacon body, from
 *   `_buildDcApiOutcomeEvent` or `_buildDcApiFlowErrorEvent`.
 * @returns {Promise<void>}
 */
async function postDcApiBeacon({exchangeData, httpClient, event}) {
  try {
    const url =
      `/workflows/${exchangeData.workflowId}` +
      `/exchanges/${exchangeData.id}` +
      `/events`;
    await httpClient.post(url, {
      json: event,
      headers: {
        Authorization: `Bearer ${exchangeData.accessToken}`
      }
    });
  } catch {
    // best-effort telemetry; never surface a beacon failure to the user
  }
}

/**
 * Build the best-effort beacon body for a `navigator.credentials.get`
 * outcome. Pure (no IO) so it can be unit-tested without a network stub;
 * `postDcApiBeacon` wires it to the POST. Exported only for testing.
 *
 * Reports the whole set of profiles that were offered, not one of them: when
 * the platform sheet is dismissed, *no* profile answered, so naming one would
 * be a fabrication. The singular `profile` is included only when exactly one
 * was offered, so existing single-profile reporting is unchanged.
 *
 * A user dismissing the platform wallet sheet is one behavior, but browsers
 * disagree on the DOMException name for it: Chromium follows the W3C Digital
 * Credentials spec and rejects with `NotAllowedError`, while Safari/iOS rejects
 * with `AbortError`. Our own timeout is already separated out by `timedOut`, so
 * any remaining `AbortError` is a browser/OS-level abort, which for Safari is a
 * user cancellation. Both names collapse to `dcapi_cancelled` so the outcome is
 * reported consistently across browsers; `errorName` still carries the original
 * DOMException name for diagnostics.
 *
 * Every type carries `elapsedMs` and `context` when `requestDigitalCredential`
 * annotated them. Cancellations and errors also carry the length-capped raw
 * `errorMessage`, `errorCause`, and the DOMException legacy `errorCode`:
 * `NotAllowedError` also covers a missing user activation or a
 * permissions-policy denial, so a "cancellation" is not always a person. The
 * server hashes the raw text and logs it only when `options.dcApiDiagnostics`
 * is on.
 *
 * @param {object} options - Options.
 * @param {Error} [options.error] - The rejection from
 *   `navigator.credentials.get`.
 * @param {boolean} [options.timedOut] - True if our own timeout aborted the
 *   call rather than a browser/OS cancellation or error.
 * @param {Array<string>} options.profiles - The profiles that were offered.
 * @returns {object} The beacon body to POST.
 */
export function _buildDcApiOutcomeEvent({error, timedOut, profiles} = {}) {
  const userCancelled =
    error?.name === 'NotAllowedError' || error?.name === 'AbortError';
  const type = timedOut ? 'dcapi_timeout' :
    userCancelled ? 'dcapi_cancelled' : 'dcapi_error';
  return {
    type,
    ..._profileFields(profiles),
    ...(timedOut ?
      {timeoutMs: DC_API_TIMEOUT_MS} :
      {errorName: error?.name, ..._errorTextFields(error)}),
    ...(Number.isFinite(error?.dcApiElapsedMs) &&
      {elapsedMs: error.dcApiElapsedMs}),
    ...(error?.dcApiContext && {context: error.dcApiContext})
  };
}

/**
 * Build the best-effort beacon body for a DC API flow failure outside
 * `navigator.credentials.get`: the envelope fetch (`phase: 'fetch'`) or the
 * response submit (`phase: 'submit'`). Pure (no IO). Exported only for
 * testing.
 *
 * @param {object} options - Options.
 * @param {Error} options.error - The failure from the HTTP call or from
 *   validating its response.
 * @param {string} options.phase - `fetch` or `submit`.
 * @param {Array<string>} options.profiles - The profiles that were offered.
 * @returns {object} The beacon body to POST.
 */
export function _buildDcApiFlowErrorEvent({error, phase, profiles} = {}) {
  return {
    type: 'dcapi_flow_error',
    phase,
    ..._profileFields(profiles),
    errorName: error?.name,
    ..._errorTextFields(error),
    // `@digitalbazaar/http-client` lifts the response status onto the error.
    ...(Number.isInteger(error?.status) && {httpStatus: error.status})
  };
}

/**
 * Snapshot the browser state that decides whether `navigator.credentials.get`
 * can succeed, for the outcome beacon. Exported only for testing.
 *
 * Every read is guarded: a missing API is omitted (or reported as
 * `allowed: null` for protocol support) rather than thrown, because this runs
 * inside the transient user activation the platform call needs.
 *
 * @param {object} options - Options.
 * @param {Array<object>} options.requests - The DC API request envelopes about
 *   to be offered.
 * @returns {object} The context: activation, visibility, focus, framing, and
 *   per-protocol `DigitalCredential.userAgentAllowsProtocol` results.
 */
export function _captureDcApiContext({requests = []} = {}) {
  const context = {};
  const userActivation = globalThis.navigator?.userActivation;
  if(typeof userActivation?.isActive === 'boolean') {
    context.userActivationIsActive = userActivation.isActive;
  }
  if(typeof userActivation?.hasBeenActive === 'boolean') {
    context.userActivationHasBeenActive = userActivation.hasBeenActive;
  }
  const doc = globalThis.document;
  if(typeof doc?.visibilityState === 'string') {
    context.visibilityState = doc.visibilityState;
  }
  if(typeof doc?.hasFocus === 'function') {
    context.hasFocus = doc.hasFocus();
  }
  const win = globalThis.window;
  if(win && 'top' in win && 'self' in win) {
    // Comparing frames is allowed cross-origin; reading their content is not.
    context.inIframe = win.top !== win.self;
  }
  const allowsProtocol =
    globalThis.DigitalCredential?.userAgentAllowsProtocol;
  context.digitalCredentialDefined =
    typeof globalThis.DigitalCredential !== 'undefined';
  context.protocolSupport = requests.map(({protocol} = {}) => {
    let allowed = null;
    if(typeof allowsProtocol === 'function') {
      try {
        allowed = allowsProtocol.call(
          globalThis.DigitalCredential, protocol) === true;
      } catch {
        // an unsupported or throwing check is reported as unknown
      }
    }
    return {protocol, allowed};
  });
  return context;
}

function _profileFields(profiles) {
  return {
    profiles,
    ...(Array.isArray(profiles) && profiles.length === 1 ?
      {profile: profiles[0]} : {})
  };
}

function _errorTextFields(error) {
  const cause = error?.cause;
  const causeText = typeof cause === 'string' ? cause :
    typeof cause?.message === 'string' ? cause.message : undefined;
  return {
    ...(typeof error?.message === 'string' &&
      {errorMessage: error.message.slice(0, MAX_DC_API_TEXT_LENGTH)}),
    ...(causeText && {errorCause: causeText.slice(0, MAX_DC_API_TEXT_LENGTH)}),
    ...(Number.isInteger(error?.code) && {errorCode: error.code})
  };
}

/**
 * Run a DC API presentation for one or more profiles.
 *
 * Fetches every requested envelope in one call, offers them all to the platform
 * in a single `navigator.credentials.get`, and posts whichever response comes
 * back for the server to verify against the request it answered.
 *
 * If `navigator.credentials.get` rejects (user cancelled or a wallet/browser
 * error), or the envelope fetch or response submit fails, that outcome is
 * reported to the server via a best-effort beacon (`POST .../events`) before
 * re-throwing, since a client-side failure would otherwise never reach the
 * server through any other route.
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
    let envelopes;
    try {
      envelopes = await fetchDcApiRequests({
        exchangeData, httpClient, profiles
      });
    } catch(fetchError) {
      // Without exchange identifiers there is nowhere to report to.
      if(exchangeData?.id && exchangeData?.workflowId) {
        await postDcApiBeacon({
          exchangeData,
          httpClient,
          event: _buildDcApiFlowErrorEvent(
            {error: fetchError, phase: 'fetch', profiles})
        });
      }
      throw fetchError;
    }
    const offeredProfiles = envelopes.map(e => e.profile);

    let credentialResponse;
    try {
      credentialResponse = await requestDigitalCredential({
        requests: envelopes.map(e => e.dcApiRequest)
      });
    } catch(navigatorError) {
      await postDcApiBeacon({
        exchangeData,
        httpClient,
        event: _buildDcApiOutcomeEvent({
          error: navigatorError,
          timedOut: navigatorError?.isDcApiTimeout === true,
          profiles: offeredProfiles
        })
      });
      throw navigatorError;
    }

    // The platform does not say which request was answered, so match the
    // response protocol back to the envelope that used it. Only a diagnostic
    // hint — the server does its own authoritative matching — so an
    // unrecognized protocol is left unattributed rather than guessed at.
    const answered = envelopes.find(
      e => e.dcApiRequest?.protocol === credentialResponse.protocol);

    let result;
    try {
      result = await submitDcApiResponse({
        exchangeData,
        httpClient,
        credentialResponse,
        profile: answered?.profile
      });
    } catch(submitError) {
      await postDcApiBeacon({
        exchangeData,
        httpClient,
        event: _buildDcApiFlowErrorEvent(
          {error: submitError, phase: 'submit', profiles: offeredProfiles})
      });
      throw submitError;
    }

    if(result?.exchange && onExchangeUpdate) {
      onExchangeUpdate(result.exchange);
    }

    return result;
  } catch(error) {
    if(error.isDcApiTimeout) {
      throw new Error(
        'Your wallet app did not respond. Try again or use another ' +
        'connection method.', {cause: error});
    } else if(error.name === 'NotAllowedError' || error.name === 'AbortError') {
      // Both are user-dismissal names (NotAllowedError on Chromium, AbortError
      // on Safari/iOS); our own timeout is handled by the isDcApiTimeout branch
      // above, so a bare AbortError here is a browser/OS dismissal.
      throw new Error(
        'The credential request was denied or cancelled.', {cause: error});
    } else if(error.message) {
      throw error;
    } else {
      throw new Error(
        'An error occurred during credential presentation.',
        {cause: error}
      );
    }
  }
}
