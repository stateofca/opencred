/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  applyWorkflowDefaults,
  OpenCredConfigSchema
} from '../../configs/configUtils.js';

const app1 = {
  clientId: 'test1',
  clientSecret: 'shhh',
  redirectUri: 'https://example.com',
  caStore: false,
  oidc: {
    redirectUri: 'https://example.com',
    claims: [],
    idTokenExpirySeconds: 3600
  },
  type: 'native',
  brand: {
    cta: '#111111',
    primary: '#a11111',
    header: '#a11111'
  }
};

const app2 = {
  clientId: 'test2',
  configFrom: 'test1',
  brand: {
    cta: '#222222',
    primary: '#a22222',
    header: '#a22222'
  }
};

const app3 = {
  clientId: 'test3',
  configFrom: 'test2',
  clientSecret: 'three is a crowd'
};

describe('Config - setting defaults with configFrom', function() {
  it('should populate defaults from configFrom config', async function() {
    const result = applyWorkflowDefaults({
      opencred: {
        defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
      },
      workflows: [app1, app2, app3],
      workflow: app3
    });
    expect(result.brand.cta).to.equal('#222222');
    expect(result.clientSecret).to.equal('three is a crowd');
    expect(result.caStore ?? true).to.equal(false);
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
    expect(() => applyWorkflowDefaults({
      opencred: {
        defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
      },
      workflows: [app4, app5],
      workflow: app4
    })).to.throwError();
  });

  it('should throw an error for missing configFrom ref', function() {
    expect(() => applyWorkflowDefaults({
      opencred: {
        defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
      },
      workflows: [app2, app3],
      workflow: app2
    })).to.throwError();
  });

});

describe('Config - reCaptcha optional', function() {
  it('should parse config without reCaptcha section', function() {
    const configWithoutReCaptcha = {
      workflows: [{
        clientId: 'test',
        clientSecret: 'secret',
        type: 'native',
        query: [{
          type: ['VerifiableCredential']
        }],
        oidc: {
          redirectUri: 'https://example.com'
        }
      }],
      defaultBrand: {
        cta: '#006847',
        primary: '#008f5a',
        header: '#004225'
      }
    };

    const result = OpenCredConfigSchema.parse(configWithoutReCaptcha);

    expect(result.reCaptcha).to.be.an('object');
    expect(result.reCaptcha.enable).to.equal(false);
    expect(result.reCaptcha.pages).to.be.an('array');
    expect(result.reCaptcha.pages.length).to.equal(0);
  });

  it('should parse config with reCaptcha section', function() {
    const configWithReCaptcha = {
      workflows: [{
        clientId: 'test',
        clientSecret: 'secret',
        type: 'native',
        query: [{
          type: ['VerifiableCredential']
        }],
        oidc: {
          redirectUri: 'https://example.com'
        }
      }],
      defaultBrand: {
        cta: '#006847',
        primary: '#008f5a',
        header: '#004225'
      },
      reCaptcha: {
        enable: true,
        version: 2,
        siteKey: 'test-site-key',
        secretKey: 'test-secret-key',
        pages: ['audit']
      }
    };

    const result = OpenCredConfigSchema.parse(configWithReCaptcha);

    expect(result.reCaptcha).to.be.an('object');
    expect(result.reCaptcha.enable).to.equal(true);
    expect(result.reCaptcha.version).to.equal(2);
    expect(result.reCaptcha.siteKey).to.equal('test-site-key');
    expect(result.reCaptcha.pages).to.eql(['audit']);
  });
});
