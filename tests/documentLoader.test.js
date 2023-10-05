import {getDocumentLoader} from '../common/documentLoader.js';
import expect from 'expect.js';

const documentLoader = getDocumentLoader().build();

const exampleDidKeyId = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';

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
});
