/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {appleWallet} from './apple-wallet.js';
import {caDmvWallet} from './ca-dmv-wallet.js';
import {googleWallet} from './google-wallet.js';
import {interactionWallet} from './protocols/index.js';
import {lcwWallet} from './lcw.js';

/**
 * Registry of all wallet configurations.
 * This file exists separately to avoid circular dependencies.
 */
export const WALLETS_REGISTRY = {
  'cadmv-wallet': caDmvWallet,
  lcw: lcwWallet,
  'google-wallet': googleWallet,
  'apple-wallet': appleWallet,
  interaction: interactionWallet
};
