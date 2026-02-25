/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {buildMdocCredentialSubject} from '../../common/mdoc.js';
import expect from 'expect.js';

describe('buildMdocCredentialSubject', () => {

  it('should return with id only when documents is missing', () => {
    const verifiedMdoc = {};
    const credentialId = 'data:application/mdl;base64,abc123';
    expect(buildMdocCredentialSubject(verifiedMdoc, credentialId))
      .to.eql({id: credentialId});
  });

  it('should return with id only when documents is not array', () => {
    const verifiedMdoc = {documents: null};
    const credentialId = 'data:application/mdl;base64,abc123';
    expect(buildMdocCredentialSubject(verifiedMdoc, credentialId))
      .to.eql({id: credentialId});
  });

  it('should return with id only when documents is empty', () => {
    const verifiedMdoc = {documents: []};
    const credentialId = 'data:application/mdl;base64,abc123';
    expect(buildMdocCredentialSubject(verifiedMdoc, credentialId))
      .to.eql({id: credentialId});
  });

  it('should flatten namespace fields into credentialSubject', () => {
    const doc = {
      issuerSignedNameSpaces: ['org.iso.18013.5.1'],
      getIssuerNameSpace: ns => {
        if(ns === 'org.iso.18013.5.1') {
          return {given_name: 'John', family_name: 'Doe'};
        }
        return {};
      }
    };
    const verifiedMdoc = {documents: [doc]};
    const credentialId = 'data:application/mdl;base64,xyz';
    const result = buildMdocCredentialSubject(verifiedMdoc, credentialId);
    expect(result).to.eql({
      id: credentialId,
      'org.iso.18013.5.1.given_name': 'John',
      'org.iso.18013.5.1.family_name': 'Doe'
    });
  });

  it('should merge multiple namespaces from same document', () => {
    const doc = {
      issuerSignedNameSpaces: ['org.iso.18013.5.1', 'org.iso.18013.5.1.mDL'],
      getIssuerNameSpace: ns => {
        if(ns === 'org.iso.18013.5.1') {
          return {given_name: 'Jane'};
        }
        if(ns === 'org.iso.18013.5.1.mDL') {
          return {document_number: 'DL123'};
        }
        return {};
      }
    };
    const verifiedMdoc = {documents: [doc]};
    const credentialId = 'mdoc-id';
    const result = buildMdocCredentialSubject(verifiedMdoc, credentialId);
    expect(result).to.eql({
      id: credentialId,
      'org.iso.18013.5.1.given_name': 'Jane',
      'org.iso.18013.5.1.mDL.document_number': 'DL123'
    });
  });

  it('should merge multiple documents', () => {
    const doc1 = {
      issuerSignedNameSpaces: ['org.iso.18013.5.1'],
      getIssuerNameSpace: ns => {
        if(ns === 'org.iso.18013.5.1') {
          return {given_name: 'Alice'};
        }
        return {};
      }
    };
    const doc2 = {
      issuerSignedNameSpaces: ['org.example.custom'],
      getIssuerNameSpace: ns => {
        if(ns === 'org.example.custom') {
          return {custom_field: 'value'};
        }
        return {};
      }
    };
    const verifiedMdoc = {documents: [doc1, doc2]};
    const credentialId = 'mdoc-id';
    const result = buildMdocCredentialSubject(verifiedMdoc, credentialId);
    expect(result).to.eql({
      id: credentialId,
      'org.iso.18013.5.1.given_name': 'Alice',
      'org.example.custom.custom_field': 'value'
    });
  });

  it('should skip document when issuerSignedNameSpaces is missing', () => {
    const doc = {getIssuerNameSpace: () => {
      return {x: 1};
    }};
    const verifiedMdoc = {documents: [doc]};
    const credentialId = 'id';
    const result = buildMdocCredentialSubject(verifiedMdoc, credentialId);
    expect(result).to.eql({id: credentialId});
  });

  it('should skip document when issuerSignedNameSpaces is not array', () => {
    const doc = {
      issuerSignedNameSpaces: 'not-array',
      getIssuerNameSpace: () => {
        return {x: 1};
      }
    };
    const verifiedMdoc = {documents: [doc]};
    const credentialId = 'id';
    const result = buildMdocCredentialSubject(verifiedMdoc, credentialId);
    expect(result).to.eql({id: credentialId});
  });

  it('should skip namespace when getIssuerNameSpace throws', () => {
    const doc = {
      issuerSignedNameSpaces: ['org.iso.18013.5.1', 'org.bad'],
      getIssuerNameSpace: ns => {
        if(ns === 'org.bad') {
          throw new Error('parse error');
        }
        return {given_name: 'John'};
      }
    };
    const verifiedMdoc = {documents: [doc]};
    const credentialId = 'id';
    const result = buildMdocCredentialSubject(verifiedMdoc, credentialId);
    expect(result).to.eql({
      id: credentialId,
      'org.iso.18013.5.1.given_name': 'John'
    });
  });

  it('should skip namespace when getIssuerNameSpace returns non-object', () => {
    const doc = {
      issuerSignedNameSpaces: ['org.iso.18013.5.1'],
      getIssuerNameSpace: () => {
        return 'not-object';
      }
    };
    const verifiedMdoc = {documents: [doc]};
    const credentialId = 'id';
    const result = buildMdocCredentialSubject(verifiedMdoc, credentialId);
    expect(result).to.eql({id: credentialId});
  });
});
