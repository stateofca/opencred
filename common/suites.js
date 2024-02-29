/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataIntegrityProof} from '@digitalbazaar/data-integrity';
import {
  cryptosuite as ecdsa2019CryptoSuite
} from '@digitalbazaar/ecdsa-2019-cryptosuite';
import {Ed25519Signature2018} from '@digitalbazaar/ed25519-signature-2018';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {
  cryptosuite as eddsa2022CryptoSuite
} from '@digitalbazaar/eddsa-2022-cryptosuite';

export const SUITES = [
  new Ed25519Signature2018(),
  new Ed25519Signature2020(),
  new DataIntegrityProof({cryptosuite: ecdsa2019CryptoSuite}),
  new DataIntegrityProof({cryptosuite: eddsa2022CryptoSuite}),
];
