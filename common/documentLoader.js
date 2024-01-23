import * as DidJwk from '@digitalbazaar/did-method-jwk';
import * as DidKey from '@digitalbazaar/did-method-key';
import fetch from 'node-fetch';

import {
  CONTEXT as CRED_CONTEXT,
  CONTEXT_URL as CRED_CONTEXT_URL
} from 'credentials-context';
import {
  CONTEXT as DI_CONTEXT,
  CONTEXT_URL as DI_CONTEXT_URL
} from '@digitalbazaar/data-integrity-context';
import {
  CONTEXT as DID_CONTEXT,
  CONTEXT_URL as DID_CONTEXT_URL
} from 'did-context';
import {
  CONTEXT as ED_SIG_2020_CONTEXT,
  CONTEXT_URL as ED_SIG_2020_CONTEXT_URL
} from 'ed25519-signature-2020-context';
import {
  CONTEXT_V1 as SL_V1_CONTEXT,
  CONTEXT_URL_V1 as SL_V1_CONTEXT_URL
} from '@digitalbazaar/vc-status-list-context';
import {
  CONTEXT as VDL_AAMVA_CONTEXT,
  CONTEXT_URL as VDL_AAMVA_CONTEXT_URL
} from '@digitalbazaar/vdl-aamva-context';
import {
  CONTEXT as VDL_BASE_CONTEXT,
  CONTEXT_URL as VDL_BASE_CONTEXT_URL
} from '@digitalbazaar/vdl-context';
import {CachedResolver} from '@digitalbazaar/did-io';
import {CryptoLD} from 'crypto-ld';
import {getResolver as didWebResolver} from 'web-did-resolver';
import {Ed25519VerificationKey2020}
  from '@digitalbazaar/ed25519-verification-key-2020';
import {JsonLdDocumentLoader} from 'jsonld-document-loader';
import {parse} from 'did-resolver';
import X25519KeyAgreement2020Context from 'x25519-key-agreement-2020-context';
import {X25519KeyAgreementKey2020}
  from '@digitalbazaar/x25519-key-agreement-key-2020';

const cryptoLd = new CryptoLD();
cryptoLd.use(Ed25519VerificationKey2020);
cryptoLd.use(X25519KeyAgreementKey2020);
const didWebDriver = options => {
  return didWebResolver(options).web;
};
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

export const didResolver = new CachedResolver();
didResolver.use({method: 'web', get: async ({did}) => {
  const parsedDID = parse(did);
  return didWebDriver()(did, parsedDID);
}});
didResolver.use(didKeyDriver);
didResolver.use(didJwkDriver);

const getDocumentLoader = () => {
  const jsonLdDocLoader = new JsonLdDocumentLoader();

  // handle static contexts
  jsonLdDocLoader.addStatic(ED_SIG_2020_CONTEXT_URL, ED_SIG_2020_CONTEXT);
  jsonLdDocLoader.addStatic(
    X25519KeyAgreement2020Context.constants.CONTEXT_URL,
    X25519KeyAgreement2020Context.contexts.get(
      X25519KeyAgreement2020Context.constants.CONTEXT_URL));
  jsonLdDocLoader.addStatic(DI_CONTEXT_URL, DI_CONTEXT);
  jsonLdDocLoader.addStatic(DID_CONTEXT_URL, DID_CONTEXT);
  jsonLdDocLoader.addStatic(CRED_CONTEXT_URL, CRED_CONTEXT);
  jsonLdDocLoader.addStatic(SL_V1_CONTEXT_URL, SL_V1_CONTEXT);
  jsonLdDocLoader.addStatic(VDL_BASE_CONTEXT_URL, VDL_BASE_CONTEXT);
  jsonLdDocLoader.addStatic(VDL_AAMVA_CONTEXT_URL, VDL_AAMVA_CONTEXT);

  // handle DIDs
  jsonLdDocLoader.setDidResolver(didResolver);

  // automatically handle all http(s) contexts that are not handled above
  const webHandler = {
    get: async ({url}) => {
      const getConfig = {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        },
        // max size for any JSON doc (in bytes, ~8 KiB)
        size: 8192,
        // timeout in ms for fetching any document
        timeout: 5000
      };
      return (await fetch(url, getConfig)).json();
    }
  };
  jsonLdDocLoader.setProtocolHandler({
    protocol: 'http',
    handler: webHandler
  });
  jsonLdDocLoader.setProtocolHandler({
    protocol: 'https',
    handler: webHandler
  });

  return jsonLdDocLoader;
};

export {getDocumentLoader};
