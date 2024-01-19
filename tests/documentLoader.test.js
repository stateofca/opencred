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
    const didJwkData = await documentLoader('did:jwk:eyJjcnYiOiJQLTI1NiIsImt0e\
SI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ\
5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9');
    expect(didJwkData).property('document');
    expect(didJwkData).property('documentUrl');
    expect(didJwkData.document).property('id');
    expect(didJwkData.document).property('verificationMethod');
    expect(didJwkData.document.id).equal(didJwkData.documentUrl);
  });
});
