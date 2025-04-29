/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  generateValidDidKeyData,
  generateValidDidWebData
} from './dids.js';
import {signUtils} from '../../common/utils.js';
import {documentLoader as testDocumentLoader} from './testDocumentLoader.js';

export const generateValidCredential = ({
  issuerDid, holderDid, template, vcVersion = 2
}) => {
  if(vcVersion === 2) {
    return {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://www.w3.org/ns/credentials/examples/v2'
      ],
      type: ['VerifiableCredential', 'MyPrototypeCredential'],
      issuer: issuerDid,
      credentialSubject: {
        id: holderDid,
        mySubjectProperty: 'mySubjectValue'
      },
      ...(template ? template : {}),
    };
  }

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
    },
    ...(template ? template : {}),
  };
};

export const generateValidSignedCredential = async ({
  holderDid,
  issuerDid,
  issuerSuite,
  didMethod = 'web',
  didWebUrl = 'https://example-cred.edu',
  documentLoader,
  credentialTemplate = {}
} = {}) => {
  let iDid = issuerDid;
  let issuerDidDocument;
  let suite = issuerSuite;
  if(!iDid || !suite) {
    switch(didMethod) {
      case 'web':
        ({
          did: iDid,
          didDocument: issuerDidDocument,
          suite
        } = await generateValidDidWebData(didWebUrl));
        break;
      case 'key':
        ({
          did: iDid,
          didDocument: issuerDidDocument,
          suite
        } = await generateValidDidKeyData());
        break;
      default:
        break;
    }
  }

  const credential = {
    ...generateValidCredential({
      issuerDid: iDid, holderDid: holderDid ?? iDid
    }),
    issuer: iDid,
    ...credentialTemplate // consider a deeper clone, but this is ok for now
  };
  const signedCredential = await signUtils.signCredentialDataIntegrity({
    credential,
    documentLoader: documentLoader ?? testDocumentLoader,
    suite
  });

  const issuanceDate = new Date(signedCredential.proof?.created);

  return {
    credential: signedCredential,
    issuerDid: iDid,
    issuerDidDocument,
    issuerSuite: suite,
    issuanceDate
  };
};
