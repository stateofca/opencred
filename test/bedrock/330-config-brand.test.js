/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';

import {baseUrl} from '../mock-data.js';
import {config} from '@bedrock/core';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

// `/config/app.json` serves the brand the browser themes itself with, so it
// must report the requested workflow's resolved brand. The workflows here are
// stubbed post-startup, i.e. with the brand `applyWorkflowDefaults` already
// merged onto them, since stubbing bypasses that step. Inheritance itself is
// covered by 20-config.test.js.
const brandedWorkflow = {
  type: 'native',
  clientId: 'branded-client',
  clientSecret: 'branded-secret',
  brand: {
    cta: '#111111',
    primary: '#a11111',
    header: '#b11111',
    homeLink: 'https://branded.example.com'
  },
  query: [{type: ['VerifiableCredential']}]
};

// A configFrom child as it looks once startup has merged the parent's brand.
const inheritingWorkflow = {
  type: 'native',
  clientId: 'inheriting-client',
  clientSecret: 'inheriting-secret',
  configFrom: 'branded-client',
  brand: {...brandedWorkflow.brand},
  query: [{type: ['VerifiableCredential']}]
};

describe('GET /config/app.json brand', function() {
  let defaultBrand;

  this.beforeEach(function() {
    defaultBrand = config.opencred.defaultBrand;
    this.workflowStub = sinon.stub(config.opencred, 'workflows').value(
      [brandedWorkflow, inheritingWorkflow]);
  });

  this.afterEach(function() {
    this.workflowStub.restore();
  });

  it('should return the workflow brand for a known client_id',
    async function() {
      const result = await client.get(
        `${baseUrl}/config/app.json?client_id=branded-client`);

      result.status.should.equal(200);
      result.data.brand.primary.should.equal('#a11111');
      result.data.brand.cta.should.equal('#111111');
      result.data.brand.header.should.equal('#b11111');
      result.data.brand.homeLink.should.equal('https://branded.example.com');
    });

  it('should return the inherited brand for a configFrom workflow',
    async function() {
      const result = await client.get(
        `${baseUrl}/config/app.json?client_id=inheriting-client`);

      result.status.should.equal(200);
      result.data.brand.primary.should.equal('#a11111');
      result.data.brand.primary.should.not.equal(defaultBrand.primary);
    });

  it('should return the default brand when client_id is absent',
    async function() {
      const result = await client.get(`${baseUrl}/config/app.json`);

      result.status.should.equal(200);
      result.data.brand.primary.should.equal(defaultBrand.primary);
    });

  it('should return the default brand for an unknown client_id',
    async function() {
      const result = await client.get(
        `${baseUrl}/config/app.json?client_id=does-not-exist`);

      result.status.should.equal(200);
      result.data.brand.primary.should.equal(defaultBrand.primary);
    });
});
