
import {describe, it} from 'mocha';
import expect from 'expect.js';
import request from 'supertest';

import {app} from '../app.js';

describe('App', async () => {
  it('should fail for unregistered client ids', async function() {
    const temp_client_id = process.env.CLIENT_ID;
    process.env.CLIENT_ID = 'abc123';
    const response = await request(app)
      .get('/login?client_id=unknown')
      .set('Accept', 'application/json');

    expect(response.headers['content-type']).to.match(/json/);
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Unknown client_id');

    process.env.CLIENT_ID = temp_client_id;
  });
});

