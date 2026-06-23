/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as DidJwk from '@digitalbazaar/did-method-jwk';
import * as DidKey from '@digitalbazaar/did-method-key';
import * as DidWeb from '@digitalbazaar/did-method-web';
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import {CachedResolver} from '@digitalbazaar/did-io';
import {
  contexts as CITIZENSHIP_CONTEXT_MAP
} from '@digitalbazaar/citizenship-context';
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
  contexts as ED25519_SIG_2020_CONTEXT_MAP
} from 'ed25519-signature-2020-context';
import {Ed25519VerificationKey2020}
  from '@digitalbazaar/ed25519-verification-key-2020';
import {JsonLdDocumentLoader} from 'jsonld-document-loader';
import {
  contexts as OPEN_BADGES_CONTEXT_MAP
} from '@digitalcredentials/open-badges-context';
import {
  contexts as SL_CONTEXT_MAP
} from '@digitalbazaar/vc-status-list-context';
import {
  contexts as VC_DPP_CONTEXT_MAP
} from '@digitalbazaar/vc-dpp-context';
import {
  contexts as VDL_AAMVA_CONTEXT_MAP
} from '@digitalbazaar/vdl-aamva-context';
import {
  contexts as VDL_CONTEXT_MAP
} from '@digitalbazaar/vdl-context';
import {
  contexts as VVC_CONTEXT_MAP
} from '@digitalbazaar/vvc-context';
import {
  contexts as X25519_KEY_AGREEMENT_CONTEXT_MAP
} from 'x25519-key-agreement-2020-context';

import {agent} from '@bedrock/https-agent';
import {contextFetch} from '../lib/logger/events/contextFetch.js';
import {decode as base58Decode} from 'base58-universal';
import {httpClient} from '@digitalbazaar/http-client';
import {logger} from '../lib/logger.js';

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
  multibaseMultikeyHeader: 'zDna'
});
// did:key jwk_jcs-pub (multicodec 0xeb51): EUDI Wallet / OpenID4VC P-256 keys
// encoded as a JCS-normalized JWK. The base58 prefix shifts with the JWK length
// (z2dm / z8DK / zYqN ...), so we route by the decoded multicodec rather than a
// string prefix: any 0xeb51 did:key is parsed, its P-256 coordinates normalized
// to 32 bytes, and canonicalized to the p256-pub (zDna) form, then resolved by
// the existing driver. Other multicodecs fall through unchanged.
const MULTICODEC_JWK_JCS_PUB = 0xeb51;

// Read an unsigned LEB128 varint from the head of `bytes`.
const readVarint = bytes => {
  let value = 0;
  let i = 0;
  for(; i < bytes.length; i++) {
    value += (bytes[i] & 0x7f) * (2 ** (7 * i));
    if((bytes[i] & 0x80) === 0) {
      return {value, length: i + 1};
    }
  }
  return {value, length: i};
};

// Normalize a base64url-encoded P-256 coordinate to exactly 32 bytes. Some
// issuers add a leading sign byte (BigInteger serialization) producing 33;
// RFC 7518 mandates a fixed 32-byte length.
const normalizeP256Coordinate = b64u => {
  let bytes = Buffer.from(b64u, 'base64url');
  if(bytes.length > 32) {
    bytes = bytes.subarray(bytes.length - 32);
  } else if(bytes.length < 32) {
    const padded = Buffer.alloc(32);
    bytes.copy(padded, 32 - bytes.length);
    bytes = padded;
  }
  return bytes.toString('base64url');
};

// Convert a jwk_jcs-pub payload (JWK JSON bytes) to a canonical p256-pub
// (`did:key:zDna…`) identifier, or null if it is not a P-256 EC key.
const jwkJcsPubToP256DidKey = async jwkBytes => {
  const jwk = JSON.parse(new TextDecoder().decode(jwkBytes));
  if(jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    return null;
  }
  jwk.x = normalizeP256Coordinate(jwk.x);
  jwk.y = normalizeP256Coordinate(jwk.y);
  const key = await EcdsaMultikey.fromJwk({jwk});
  return `did:key:${key.publicKeyMultibase}`;
};

// Route did:key resolution by decoded multicodec (not multibase string prefix),
// so every jwk_jcs-pub length variant (z2dm/z8DK/zYqN/…) resolves.
const baseDidKeyGet = didKeyDriver.get.bind(didKeyDriver);
didKeyDriver.get = async (options = {}) => {
  const id = options.did || options.url;
  if(typeof id === 'string' && id.startsWith('did:key:z')) {
    const multibase = id.split('#')[0].slice('did:key:'.length);
    let decoded = null;
    try {
      decoded = base58Decode(multibase.slice(1));
    } catch {
      decoded = null;
    }
    if(decoded && decoded.length) {
      const {value: multicodec, length} = readVarint(decoded);
      if(multicodec === MULTICODEC_JWK_JCS_PUB) {
        const canonical = await jwkJcsPubToP256DidKey(decoded.slice(length));
        if(canonical) {
          return baseDidKeyGet({...options, did: canonical, url: undefined});
        }
      }
    }
  }
  return baseDidKeyGet(options);
};

export const didResolver = new CachedResolver();
didResolver.use(didKeyDriver);
didResolver.use(didJwkDriver);
didResolver.use(didWebDriver);

export const getDocumentLoader = () => {
  const jsonLdDocLoader = new JsonLdDocumentLoader();

  // handle static context maps
  jsonLdDocLoader.addDocuments({documents: CRED_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: CITIZENSHIP_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: DATA_INTEGRITY_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: DID_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: ED25519_SIG_2020_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: OPEN_BADGES_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: SL_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: VC_DPP_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: VDL_AAMVA_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: VDL_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: VVC_CONTEXT_MAP});
  jsonLdDocLoader.addDocuments({documents: X25519_KEY_AGREEMENT_CONTEXT_MAP});

  // handle DIDs
  jsonLdDocLoader.setDidResolver(didResolver);

  // automatically handle all http(s) contexts that are not handled above
  const customHandler = {
    async get({url}) {
      const event = contextFetch({url});
      logger.info(event.logName, event.event);
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
 *
 * @param {object} overrides - Map of DID to resolved document overrides.
 * @returns {object} Resolver with resolve function.
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

export const defaultDocLoader = getDocumentLoader().build();
