/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import {createFromMultibase, DidKeyDriver}
  from '@digitalbazaar/did-method-key';
import {Ed25519VerificationKey2020}
  from '@digitalbazaar/ed25519-verification-key-2020';
import {resolveJwkJcsPubDidKey} from './jwk-jcs-pub.js';

// A did:key driver that additionally resolves jwk_jcs-pub (`0xeb51`) P-256
// identifiers (EUDI Wallet / OpenID4VC), which the stock driver does not
// support. Resolution is routed by the decoded multicodec (see
// ./jwk-jcs-pub.js); every other identifier is delegated to the stock driver
// via `super.get()`.
class JwkJcsPubDidKeyDriver extends DidKeyDriver {
  async get(options = {}) {
    const id = options.did || options.url;
    const resolved = typeof id === 'string' ?
      await resolveJwkJcsPubDidKey({id}) : null;
    return resolved ?? super.get(options);
  }
}

// Ed25519 (`z6Mk`) and p256-pub (`zDna`) via the standard multikey headers.
const didKeyDriver = new JwkJcsPubDidKeyDriver();
didKeyDriver.use({
  name: 'Ed25519',
  handler: Ed25519VerificationKey2020,
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: createFromMultibase(Ed25519VerificationKey2020)
});
didKeyDriver.use({
  fromMultibase: EcdsaMultikey.from,
  multibaseMultikeyHeader: 'zDna'
});

export {didKeyDriver};
