import {describe, it} from 'mocha';

import assert from 'node:assert';
import request from 'supertest';

import {app} from '../app.js';

describe('App', async () => {
  it('should respond to a health check', done => {
    assert.ok(app);
    request(app)
      .get('/health')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200, done);
  });
});
