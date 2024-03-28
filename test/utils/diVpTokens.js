/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createId, signUtils} from '../../common/utils.js';
import {
  generateValidDidKeyData,
  generateValidDidWebData
} from './dids.js';
import {generateValidSignedCredential} from './credentials.js';
import {getDocumentLoader} from '../../common/documentLoader.js';

const documentLoader = getDocumentLoader().build();

export const generateValidDiVpToken = async ({
  didMethodPresentation = 'key',
  didWebUrlPresentation = 'https://example-prez.edu',
  didMethodCredentials = ['web'],
  didWebUrlCredentials = ['https://example-cred.edu'],
  numberOfCredentials = didMethodCredentials.length
} = {}) => {
  let issuerDidDocumentPresentation;
  let suite;
  switch(didMethodPresentation) {
    case 'web':
      ({
        didDocument: issuerDidDocumentPresentation,
        suite
      } = await generateValidDidWebData(didWebUrlPresentation));
      break;
    case 'key':
      ({
        didDocument: issuerDidDocumentPresentation,
        suite
      } = await generateValidDidKeyData());
      break;
    default:
      break;
  }

  const credentials = [];
  const issuerDidsCredentials = [];
  const issuerDidDocumentsCredentials = [];
  const issuerIssuanceDatesCredentials = [];
  for(let i = 0; i < numberOfCredentials; i++) {
    const didMethod = didMethodCredentials[i];
    const didWebUrl = didWebUrlCredentials[i];
    const {
      credential,
      issuerDid,
      issuerDidDocument,
      issuanceDate
    } =
      await generateValidSignedCredential({
        didMethod,
        didWebUrl
      });
    credentials.push(credential);
    issuerDidsCredentials.push(issuerDid);
    issuerDidDocumentsCredentials.push(issuerDidDocument);
    issuerIssuanceDatesCredentials.push(issuanceDate);
  }

  const presentation = signUtils
    .createPresentationDataIntegrity({
      verifiableCredential: credentials
    });
  const signedPresentation = await signUtils.signPresentationDataIntegrity({
    presentation,
    challenge: await createId(),
    documentLoader,
    suite
  });

  const issuanceDatePresentation = new Date(signedPresentation.proof?.created);

  return {
    vpToken: signedPresentation,
    issuerDidDocumentPresentation,
    issuerDidsCredentials,
    issuerDidDocumentsCredentials,
    issuanceDatePresentation,
    issuerIssuanceDatesCredentials
  };
};
