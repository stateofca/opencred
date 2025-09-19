/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as DidJwk from '@digitalbazaar/did-method-jwk';
import * as DidKey from '@digitalbazaar/did-method-key';
import * as DidWeb from '@digitalbazaar/did-method-web';
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';

import {CachedResolver} from '@digitalbazaar/did-io';
import {
  contexts as CRED_CONTEXT_MAP
} from '@digitalbazaar/credentials-context';
import {
  contexts as DATA_INTEGRITY_CONTEXT_MAP
} from '@digitalbazaar/data-integrity-context';
import {
  contexts as DID_CONTEXT_MAP
} from 'did-context';
import {
  contexts as ED25519_SIG_2020_CONTEXT_MAP,
} from 'ed25519-signature-2020-context';
import {Ed25519VerificationKey2020}
  from '@digitalbazaar/ed25519-verification-key-2020';
import {JsonLdDocumentLoader} from 'jsonld-document-loader';
import {
  contexts as SL_CONTEXT_MAP
} from '@digitalbazaar/vc-status-list-context';
import {
  contexts as VDL_AAMVA_CONTEXT_MAP,
} from '@digitalbazaar/vdl-aamva-context';
import {
  contexts as VDL_CONTEXT_MAP
} from '@digitalbazaar/vdl-context';
import {
  contexts as X25519_KEY_AGREEMENT_CONTEXT_MAP
} from 'x25519-key-agreement-2020-context';

import {agent} from '@bedrock/https-agent';
import {httpClient} from '@digitalbazaar/http-client';

const didWebDriver = DidWeb.driver();
const didKeyDriver = DidKey.driver();
didKeyDriver.use({
  name: 'Ed25519',
  handler: Ed25519VerificationKey2020,
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: DidKey.createFromMultibase(Ed25519VerificationKey2020)
});
const didJwkDriver = DidJwk.driver();
didJwkDriver.use({
  algorithm: 'EdDSA',
  handler: Ed25519VerificationKey2020.from
});
didJwkDriver.use({
  algorithm: 'P-256',
  handler: EcdsaMultikey.from
});
didKeyDriver.use({
  fromMultibase: EcdsaMultikey.from,
  multibaseMultikeyHeader: 'zDna',
});

export const didResolver = new CachedResolver();
didResolver.use(didKeyDriver);
didResolver.use(didJwkDriver);
didResolver.use(didWebDriver);

export const getDocumentLoader = () => {
  const jsonLdDocLoader = new JsonLdDocumentLoader();

  // handle static contexts
  ED25519_SIG_2020_CONTEXT_MAP.forEach((context, url) => {
    jsonLdDocLoader.addStatic(url, context);
  });
  X25519_KEY_AGREEMENT_CONTEXT_MAP.forEach((context, url) => {
    jsonLdDocLoader.addStatic(url, context);
  });
  DATA_INTEGRITY_CONTEXT_MAP.forEach((context, url) => {
    jsonLdDocLoader.addStatic(url, context);
  });
  DID_CONTEXT_MAP.forEach((context, url) => {
    jsonLdDocLoader.addStatic(url, context);
  });
  CRED_CONTEXT_MAP.forEach((context, url) => {
    jsonLdDocLoader.addStatic(url, context);
  });
  SL_CONTEXT_MAP.forEach((context, url) => {
    jsonLdDocLoader.addStatic(url, context);
  });
  VDL_CONTEXT_MAP.forEach((context, url) => {
    jsonLdDocLoader.addStatic(url, context);
  });
  VDL_AAMVA_CONTEXT_MAP.forEach((context, url) => {
    jsonLdDocLoader.addStatic(url, context);
  });

  // handle DIDs
  jsonLdDocLoader.setDidResolver(didResolver);

  // automatically handle all http(s) contexts that are not handled above
  const customHandler = {
    async get({url}) {
      const response = await httpClient.get(url, {agent});
      const {data} = response;
      return data;
    }
  };

  jsonLdDocLoader.setProtocolHandler({
    protocol: 'https', handler: customHandler
  });

  return jsonLdDocLoader;
};

// DID methods where all cryptographic material is self-contained
const STATIC_DID_METHOD_PATTERNS = [
  /^did:(jwk):/,
  /^did:(key):/
];

// DID requires historical tracking
export const didRequiresHistoricalTracking = async did => {
  return STATIC_DID_METHOD_PATTERNS.every(p => !did.match(p));
};

/**
 * Uses default resolver, in tandem with overrides, to resolve DIDs.
 * This is necessary for presentation auditing with old DID documents.
 */
export const getOverrideDidResolver = overrides => {
  const resolve = async did => {
    if(overrides[did]) {
      return overrides[did];
    }
    return didResolver.get({did, verificationMethodType: 'JsonWebKey2020'});
  };
  return {resolve};
};
