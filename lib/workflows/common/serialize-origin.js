/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Returns the HTML-spec serialized origin of a URI:
 * `scheme://host[:port]` with default ports stripped and no path,
 * query, fragment, or trailing slash. Used to align the
 * `dcapiInfo` SHA-256 hash on both sides of the ISO 18013-7
 * Annex C SessionTranscript.
 *
 * @param {string} uri - Absolute URI (e.g. `config.server.baseUri`).
 * @returns {string} Serialized origin.
 * @throws {TypeError} When `uri` is not a valid absolute URI.
 */
export const serializeOrigin = uri => new URL(uri).origin;
