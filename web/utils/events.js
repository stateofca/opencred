/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Best-effort, non-blocking report of a client-side exchange event to the
 * exchange events endpoint. These are UI-funnel signals such as the
 * interaction picker being opened, a method selected, or the picker
 * dismissed, that never reach the server through any other route. A post
 * failure must never throw or otherwise affect the user-facing flow.
 *
 * @param {object} options - Options for the report.
 * @param {object} options.exchangeData - The exchange data object
 *   (`id`, `workflowId`, `accessToken`).
 * @param {object} options.httpClient - HTTP client instance.
 * @param {string} options.type - The event type string recognized by the
 *   server's exchange-event handlers (e.g. `interaction_picker_opened`).
 * @param {object} [options.payload] - Additional non-personal fields to
 *   include in the event body (e.g. `{method}` or `{fromMethod, toMethod}`).
 * @returns {Promise<void>}
 */
export async function reportExchangeEvent({
  exchangeData, httpClient, type, payload = {}
}) {
  try {
    const url =
      `/workflows/${exchangeData.workflowId}` +
      `/exchanges/${exchangeData.id}` +
      `/events`;
    await httpClient.post(url, {
      json: {
        type,
        ...payload
      },
      headers: {
        Authorization: `Bearer ${exchangeData.accessToken}`
      }
    });
  } catch {
    // best-effort telemetry; never surface a reporting failure to the user
  }
}
