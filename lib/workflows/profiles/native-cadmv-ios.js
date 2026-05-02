/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// CA DMV iOS wallet uses Apple Identity Document Services, which
// follows the ISO 18013-7 Annex C protocol (HPKE-encrypted CBOR).
// This module re-exports the Annex C handlers so that "cadmv-ios"
// is a first-class profile name in the dispatcher registry.
// This will also enable us to handle any potential compatibility
// tweaks that we may need to make for this wallet.

export {
  generateAuthorizationRequest,
  handleAuthorizationResponse
} from './native-18013-7-annex-c.js';
