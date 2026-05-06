/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {appleWallet} from './apple-wallet.js';
import {cadmvAndroidWallet} from './cadmv-android.js';
import {cadmvIosWallet} from './cadmv-ios.js';
import {googleWallet} from './google-wallet.js';
import {lcwWallet} from './lcw.js';

/**
 * Registry of all wallet configurations.
 * This file exists separately to avoid circular dependencies.
 */
export const WALLETS_REGISTRY = {
  'cadmv-android': cadmvAndroidWallet,
  'cadmv-ios': cadmvIosWallet,
  lcw: lcwWallet,
  'google-wallet': googleWallet,
  'apple-wallet': appleWallet
};
