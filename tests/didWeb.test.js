import * as sinon from 'sinon';
import {describe, it} from 'mocha';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';
import {config} from '../config/config.js';

describe('OpenCred did:web support', async () => {
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
});
