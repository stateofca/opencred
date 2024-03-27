import * as DidKey from '@digitalbazaar/did-method-key';
import * as DidWeb from '@digitalbazaar/did-method-web';

import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {Ed25519VerificationKey2020}
  from '@digitalbazaar/ed25519-verification-key-2020';

const didWebDriver = DidWeb.driver();
didWebDriver.use({
  name: 'Ed25519',
  handler: Ed25519VerificationKey2020,
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: DidKey.createFromMultibase(Ed25519VerificationKey2020)
});
const didKeyDriver = DidKey.driver();
didKeyDriver.use({
  name: 'Ed25519',
  handler: Ed25519VerificationKey2020,
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: DidKey.createFromMultibase(Ed25519VerificationKey2020)
});

export const generateValidDidWebData = async url => {
  const verificationKeyPair = await Ed25519VerificationKey2020.generate();
  const {didDocument} = await didWebDriver.fromKeyPair({
    url,
    verificationKeyPair
  });
  const did = didDocument.id;
  const key = await Ed25519VerificationKey2020.from({
    ...verificationKeyPair, controller: did
  });
  const suite = new Ed25519Signature2020({key});
  return {did: didDocument.id, didDocument, suite};
};

export const generateValidDidKeyData = async () => {
  const verificationKeyPair = await Ed25519VerificationKey2020.generate();
  const {didDocument} = await didKeyDriver.fromKeyPair({
    verificationKeyPair
  });
  const did = didDocument.id;
  const key = await Ed25519VerificationKey2020.from({
    ...verificationKeyPair, controller: did
  });
  const suite = new Ed25519Signature2020({key});
  return {did: didDocument.id, didDocument, suite};
};
