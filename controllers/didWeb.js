import {Ed25519Signature2020, suiteContext} from
  '@digitalbazaar/ed25519-signature-2020';
import {decodeSecretKeySeed} from 'bnid';
import {Ed25519VerificationKey2020} from
  '@digitalbazaar/ed25519-verification-key-2020';
import {getDocumentLoader} from '../common/documentLoader.js';
import jsigs from 'jsonld-signatures';

import {config} from '../config/config.js';

const {purposes: {AssertionProofPurpose}} = jsigs;

// Converts Configured domain to DID web format, naive implementation
const domainToDidWeb = domain => {
  const didWeb = `did:web:${domain.replace(/^https?:\/\//, '')}`;
  return didWeb;
};

const keyPairFromSeed = async (seed, did, includePrivateKeys = false) => {
  const decodedSeed = decodeSecretKeySeed({secretKeySeed: seed});
  const keyPair = await Ed25519VerificationKey2020.generate({
    seed: decodedSeed,
    controller: did,
  });
  return {
    ...keyPair.export({publicKey: true, privateKey: includePrivateKeys}),
    id: `${did}#${keyPair.fingerprint()}`,
  };
};

const getDLCred = async (did, key) => {
  const currentDate = new Date();
  const expirationDate = new Date();
  expirationDate.setFullYear(
    currentDate.getFullYear() + 1);
  const credential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://identity.foundation/.well-known/did-configuration/v1'
    ],
    issuer: did,
    issuanceDate: currentDate.toISOString(),
    expirationDate: expirationDate.toISOString(),
    type: [
      'VerifiableCredential',
      'DomainLinkageCredential'
    ],
    credentialSubject: {
      id: did,
      origin: config.domain
    }
  };
  const suite = new Ed25519Signature2020({key});
  suite.date = credential.issuanceDate;
  const documentLoader = getDocumentLoader().build();
  const signedVC = await jsigs.sign(credential, {
    suite, purpose: new AssertionProofPurpose(), documentLoader
  });
  return signedVC;
};

const getDLCreds = async () => {
  const did = domainToDidWeb(config.domain);
  const signingKeys = config.signingKeys ?? [];
  const linkedDids = [];
  const domainLinkingKeys = signingKeys.filter(
    sk => sk.purpose?.includes('DomainLinkageCredential')
  );
  if(did && domainLinkingKeys.length) {
    for(const sk of domainLinkingKeys) {
      if(sk.type == 'Ed25519VerificationKey2020') {
        const kp = await keyPairFromSeed(sk.seed, did, true);
        const hydratedKey = await Ed25519VerificationKey2020.from(kp);
        const vc = await getDLCred(did, hydratedKey);
        linkedDids.push(vc);
      }
    }
    return linkedDids.filter(sk => !!sk);
  } else {
    return [];
  }
};

const getKeyDescriptors = async (did, includePrivateKeys = false) => {
  const signingKeys = config.signingKeys;
  const descriptors = [];
  for(const sk of signingKeys) {
    if(sk.type == 'Ed25519VerificationKey2020') {
      const kp = await keyPairFromSeed(sk.seed, did, includePrivateKeys);
      descriptors.push([kp, sk.purpose]);
    }
  }
  return descriptors;
};

/**
 * If there is a "didWeb" section in the config, return the document
 * @param {Request} req - Express Request object
 * @param {Response} res - Express Response object
 */
export const didWebDocument = async (req, res) => {
  if(!config.didWeb?.enabled) {
    return res.status(404).send({
      message: 'A did:web document is not available for this domain.'
    });
  }
  if(config.domain.startsWith('http://')) {
    console.log('WARNING: did:web is not secure. Please use https://');
  }

  const did = domainToDidWeb(config.domain);
  const keyDescriptors = await getKeyDescriptors(did, false);
  const doc = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      suiteContext.CONTEXT_URL
    ],
    id: did,
    service: [],
    verificationMethod: keyDescriptors.map(kd => kd[0]),
    assertionMethod: keyDescriptors.filter(
      kd => kd[1].includes('assertionMethod')
    ).map(kd => kd[0].id)
  };
  res.send(doc);
};

export const didConfigurationDocument = async (req, res) => {
  const linked_dids = config.didWeb?.enabled ? await getDLCreds() : [];

  const doc = {
    '@context': 'https://identity.foundation/.well-known/did-configuration/v1',
    linked_dids
  };
  res.send(doc);
};
