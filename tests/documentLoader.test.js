import {describe, it} from 'mocha';

import expect from 'expect.js';
import {getDocumentLoader} from '../common/documentLoader.js';

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
});
