/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import fs from 'node:fs';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'node:https';

import {baseUrl} from '../mock-data.js';

const agent = new https.Agent({rejectUnauthorized: false});
const client = httpClient.extend({agent});

const pkg = JSON.parse(fs.readFileSync(
  new URL('../../package.json', import.meta.url)));

describe('Version Endpoint', function() {
  it('should return the service name and version', async function() {
    const {data, status} = await client.get(`${baseUrl}/version`);
    expect(status).to.equal(200);
    expect(data).to.eql({name: pkg.name, version: pkg.version});
  });

  it('should respond without a client_id', async function() {
    const {data} = await client.get(`${baseUrl}/version?client_id=missing`);
    expect(data.version).to.equal(pkg.version);
  });
});
