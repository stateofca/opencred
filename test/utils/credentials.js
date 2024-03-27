import {
  generateValidDidKeyData,
  generateValidDidWebData
} from './dids.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import {signUtils} from '../../common/utils.js';

const documentLoader = getDocumentLoader().build();

export const generateValidCredential = ({
  issuerDid,
  holderDid
}) => {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/2018/credentials/examples/v1'
    ],
    type: ['VerifiableCredential', 'UniversityDegreeCredential'],
    issuer: issuerDid,
    credentialSubject: {
      id: holderDid,
      degree: {
        type: 'BachelorDegree',
        name: 'Bachelor of Science and Arts'
      }
    }
  };
};

export const generateValidSignedCredential = async ({
  didMethod = 'web',
  didWebUrl = 'https://example-cred.edu'
} = {}) => {
  let issuerDid;
  let issuerDidDocument;
  let suite;
  switch(didMethod) {
    case 'web':
      ({
        did: issuerDid,
        didDocument: issuerDidDocument,
        suite
      } = await generateValidDidWebData(didWebUrl));
      break;
    case 'key':
      ({
        did: issuerDid,
        didDocument: issuerDidDocument,
        suite
      } = await generateValidDidKeyData());
      break;
    default:
      break;
  }

  const credential = generateValidCredential({
    issuerDid, holderDid: issuerDid
  });
  const signedCredential = await signUtils.signCredentialDataIntegrity({
    credential,
    documentLoader,
    suite
  });

  const issuanceDate = new Date(signedCredential.proof?.created);

  return {
    credential: signedCredential,
    issuerDid,
    issuerDidDocument,
    issuanceDate
  };
};
