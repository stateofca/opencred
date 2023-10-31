import {Ed25519Signature2018} from '@digitalbazaar/ed25519-signature-2018';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {Ed25519VerificationKey2018} from
  '@digitalbazaar/ed25519-verification-key-2018';
import {Ed25519VerificationKey2020} from
  '@digitalbazaar/ed25519-verification-key-2020';
import {generateId} from 'bnid';

export const createId = async () => {
  const id = await generateId({
    bitLength: 128,
    encoding: 'base58',
    multibase: true,
    multihash: true
  });
  return id;
};

export const getSuite = async verificationMethod => {
  if(verificationMethod.type === 'Ed25519VerificationKey2020') {
    return new Ed25519Signature2020({
      key: await Ed25519VerificationKey2020.from(verificationMethod)
    });
  } else if(verificationMethod.type === 'Ed25519VerificationKey2018') {
    return new Ed25519Signature2018({
      key: await Ed25519VerificationKey2018.from(verificationMethod)
    });
  }
  throw new Error(`verificationMethod ${verificationMethod} not supported`);
};
