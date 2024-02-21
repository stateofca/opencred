import * as sinon from 'sinon';
import expect from 'expect.js';
import {getDocumentLoader} from '../../common/documentLoader.js';
import {httpClient} from '@digitalbazaar/http-client';

const documentLoader = getDocumentLoader().build();

const exampleDidKeyId =
  'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';

describe('Document Loader', async () => {
  it('load did:key document', async function() {
    const didKeyData = await documentLoader(exampleDidKeyId);
    expect(didKeyData).property('document');
    expect(didKeyData).property('documentUrl');
    expect(didKeyData.document).property('id');
    expect(didKeyData.document).property('verificationMethod');
    expect(didKeyData.document).property('authentication');
    expect(didKeyData.document).property('assertionMethod');
    expect(didKeyData.document).property('capabilityDelegation');
    expect(didKeyData.document).property('capabilityInvocation');
    expect(didKeyData.document).property('keyAgreement');
    expect(didKeyData.document.id).equal(didKeyData.documentUrl);
  });

  it('load did:jwk document', async function() {
    const didJwkData = await documentLoader('did:jwk:eyJraWQiOiJ1cm46aWV0ZjpwYX\
JhbXM6b2F1dGg6andrLXRodW1icHJpbnQ6c2hhLTI1NjpoeGx4RmdnNF9hX202Tk1kVkJmbjVZa0huN\
Td6eDFvanpzVzROalpXalk4Iiwia3R5IjoiRUMiLCJjcnYiOiJQLTI1NiIsImFsZyI6IkVTMjU2Iiwi\
eCI6IkRpMTZpR1NwU1o4NjBCWTRJZ3ZfcHNkLXkyUjB0cTR2NF92eFZvVXFQVzAiLCJ5IjoidjZRdld\
mZ0JmU1YxeE94SG1WalRQeWlBY2ZqVGF1Znp0N3RpUDZYb0Y2VSJ9');
    expect(didJwkData).property('document');
    expect(didJwkData).property('documentUrl');
    expect(didJwkData.document).property('id');
    expect(didJwkData.document).property('verificationMethod');
    expect(didJwkData.document).property('authentication');
    expect(didJwkData.document).property('assertionMethod');
    expect(didJwkData.document).property('capabilityDelegation');
    expect(didJwkData.document).property('capabilityInvocation');
    expect(didJwkData.document.id).equal(didJwkData.documentUrl);
  });

  it('load did:web document', async function() {
    const stub = sinon.stub(httpClient, 'get');
    stub.withArgs('https://example.com/.well-known/did.json',
      sinon.match.any).returns({data: {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        'https://w3id.org/security/suites/x25519-2020/v1'
      ],
      id: 'did:web:example.com',
      verificationMethod: [
        {
          id: 'did:web:example.com#1',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:web:example.com',
          publicKeyMultibase: 'z6Mkpw72M9suPCBv48X2Xj4YKZJH9W7wzEK1aS6JioKSo89C'
        }
      ],
      authentication: [
        'did:web:example.com#1'
      ],
      assertionMethod: [
        'did:web:example.com#1'
      ],
      capabilityDelegation: [
        'did:web:example.com#1'
      ],
      capabilityInvocation: [
        'did:web:example.com#1'
      ],
      keyAgreement: [
        {
          id: 'did:web:example.com#0',
          type: 'X25519KeyAgreementKey2020',
          controller: 'did:web:example.com',
          publicKeyMultibase: 'z6LSgxJr5q1pwHPbiK7u8Pw1GvnfMTZSMxkhaorQ1aJYWFz3'
        }
      ]
    }});
    const didWebData = await documentLoader('did:web:example.com');
    expect(didWebData).property('document');
    expect(didWebData).property('documentUrl');
    expect(didWebData.document).property('id');
    expect(didWebData.document).property('verificationMethod');
    expect(didWebData.document).property('authentication');
    expect(didWebData.document).property('assertionMethod');
    expect(didWebData.document).property('capabilityDelegation');
    expect(didWebData.document).property('capabilityInvocation');
    expect(didWebData.document.id).equal(didWebData.documentUrl);
    stub.restore();
  });
});
