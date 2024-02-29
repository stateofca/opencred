/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {applyRpDefaults} from '../../configs/configUtils.js';

const app1 = {
  clientId: 'test1',
  clientSecret: 'shhh',
  redirectUri: 'https://example.com',
  scopes: [{name: 'openid'}],
  workflow: {
    type: 'native',
    id: 'testworkflow',
    steps: {
      waiting: {
        verifiablePresentationRequest: '{}'
      }
    }
  },
  brand: {
    cta: '#111111',
    primary: '#a11111',
    header: '#a11111',
  }
};

const app2 = {
  clientId: 'test2',
  redirectUri: 'https://example.com',
  configFrom: 'test1',
  brand: {
    cta: '#222222',
    primary: '#a22222',
    header: '#a22222',
  }
};

const app3 = {
  clientId: 'test3',
  configFrom: 'test2',
  clientSecret: 'three is a crowd'
};

describe('Config - setting defaults with configFrom', function() {
  it('should populate defaults from configFrom config', async function() {
    const result = applyRpDefaults([app1, app2, app3], app3);
    expect(result.brand.cta).to.equal('#222222');
    expect(result.clientSecret).to.equal('three is a crowd');
  });

  it('should throw an error for circular configFrom refs', function() {
    const app4 = {
      clientId: 'test5',
      configFrom: 'test4'
    };
    const app5 = {
      clientId: 'test4',
      configFrom: 'test5'
    };
    expect(() => applyRpDefaults([app4, app5], app4)).to.throwError();
  });

  it('should throw an error for missing configFrom ref', function() {
    expect(() => applyRpDefaults([app2, app3], app2)).to.throwError();
  });

});
