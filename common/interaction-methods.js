/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * List of all available interaction methods in the system.
 * This is a common reference that can be imported and consulted.
 */
export const INTERACTION_METHODS_LIST = [
  'qr',
  'link',
  'dcapi',
  'chapi'
];

/**
 * Interaction methods that work on the same device (no QR scanning needed).
 */
export const SAME_DEVICE_METHODS = [
  'dcapi',
  'link',
  'chapi'
];

/**
 * Interaction methods that require cross-device communication (QR scanning).
 */
export const CROSS_DEVICE_METHODS = [
  'qr'
];
