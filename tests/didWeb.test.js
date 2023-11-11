import * as sinon from 'sinon';
import {describe, it} from 'mocha';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {config} from '../config/config.js';
import {createId} from '../common/utils.js';

describe('OpenCred did:web support', function() {
  it('should return 404 if not enabled', async function() {
    const configStub = sinon.stub(config, 'didWeb').value({enabled: false});
    const response = await request(app)
      .get('/.well-known/did.json')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(404);
    expect(response.body.message).to.equal(
      'A did:web document is not available for this domain.'
    );
    configStub.restore();
  });

  it('should return did:web document', async function() {
    const didWebStub = sinon.stub(config, 'didWeb').value({enabled: true});
    const domainStub = sinon.stub(config, 'domain').value('https://this.com');
    const keysStub = sinon.stub(config, 'signingKeys').value([]);
    const response = await request(app)
      .get('/.well-known/did.json')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.id).to.equal('did:web:this.com');
    expect(response.body.verificationMethod.length).to.equal(0);

    keysStub.restore();
    domainStub.restore();
    didWebStub.restore();
  });

  it('should return did:web document verificationMethod', async function() {
    const didWebStub = sinon.stub(config, 'didWeb').value({enabled: true});
    const domainStub = sinon.stub(config, 'domain').value('https://this.com');
    const keysStub = sinon.stub(config, 'signingKeys').value([
      {
        type: 'Ed25519VerificationKey2020',
        seed: await createId(256),
        purpose: ['assertionMethod']
      }
    ]);

    const response = await request(app)
      .get('/.well-known/did.json')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.id).to.equal('did:web:this.com');
    expect(response.body.verificationMethod.length).to.equal(1);
    expect(response.body.assertionMethod.length).to.equal(1);
    expect(response.body.verificationMethod[0].id).to.equal(
      response.body.assertionMethod[0]
    );
    expect(response.body.verificationMethod[0]
      .publicKeyMultibase).to.not.be(undefined);
    expect(response.body.verificationMethod[0]
      .privateKeyMultibase).to.be(undefined);

    keysStub.restore();
    domainStub.restore();
    didWebStub.restore();
  });
});

describe('DID Linked Domain credential endpoint', () => {
  it('should return an empty list if not enabled', async function() {
    const configStub = sinon.stub(config, 'didWeb').value({enabled: false});
    const response = await request(app)
      .get('/.well-known/did-configuration.json')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.linked_dids.length).to.equal(0);
    configStub.restore();
  });

  it('should return a DomainLinkageCredential', async function() {
    const didWebStub = sinon.stub(config, 'didWeb').value({enabled: true});
    const domainStub = sinon.stub(config, 'domain').value('https://this.com');
    const keysStub = sinon.stub(config, 'signingKeys').value([
      {
        type: 'Ed25519VerificationKey2020',
        seed: await createId(256),
        purpose: ['DomainLinkageCredential']
      }
    ]);

    const response = await request(app)
      .get('/.well-known/did-configuration.json')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(200);
    expect(response.body.linked_dids.length).to.equal(1);
    expect(response.body.linked_dids[0].type.includes(
      'DomainLinkageCredential'
    )).to.be(true);

    keysStub.restore();
    domainStub.restore();
    didWebStub.restore();
  });

  it('won\'t return a credential for a key without purpose', async function() {
    const didWebStub = sinon.stub(config, 'didWeb').value({enabled: true});
    const domainStub = sinon.stub(config, 'domain').value('https://this.com');
    const keysStub = sinon.stub(config, 'signingKeys').value([
      {
        type: 'Ed25519VerificationKey2020',
        seed: await createId(256),
        purpose: ['assertionMethod']
      }
    ]);

    const response = await request(app)
      .get('/.well-known/did-configuration.json')
      .set('Accept', 'application/json');

    expect(response.status).to.equal(200);
    expect(response.body.linked_dids.length).to.equal(0);

    keysStub.restore();
    domainStub.restore();
    didWebStub.restore();
  });
});
