/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  applyWorkflowDefaults,
  OpenCredConfigSchema,
  resolveConfigFrom
} from '../../configs/config-utils.js';

// configFrom test fixtures
const baseNativeWorkflow = {
  clientId: 'parent-native',
  clientSecret: 'parent-secret',
  type: 'native',
  name: 'Parent Workflow',
  description: 'A parent workflow',
  caStore: false,
  dcApiEnabled: true,
  wallets: ['cadmv-ios', 'cadmv-android'],
  public: true,
  trustedCredentialIssuers: ['did:web:example.com'],
  untrustedVariableAllowList: ['caseId'],
  brand: {
    cta: '#111111',
    primary: '#a11111',
    header: '#b11111',
    homeLink: 'https://parent.example.com'
  },
  translations: {
    en: {qrTitle: 'Parent Title'}
  },
  oidc: {
    redirectUri: 'https://parent.example.com/callback',
    claims: [],
    idTokenExpirySeconds: 3600
  },
  query: [{type: ['Iso18013DriversLicenseCredential'],
    format: ['jwt_vc_json']}],
  dcql_query: {credentials: [{id: 'test', format: 'jwt_vc_json'}]},
  verifiablePresentationRequest: '{"query":{"type":"QueryByExample"}}'
};

const defaultBrand = {cta: '#006847', primary: '#008f5a', header: '#004225'};
const opencred = {defaultBrand};

describe('Config - configFrom inheritance', function() {
  it('should inherit only base fields from parent', function() {
    const child = {
      clientId: 'child-1',
      type: 'native',
      configFrom: 'parent-native',
      query: [{fields: {'org.iso.18013.5.1': ['family_name']},
        format: ['mso_mdoc']}]
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [baseNativeWorkflow, child],
      workflow: child
    });

    // Base fields inherited
    expect(result.name).to.equal('Parent Workflow');
    expect(result.description).to.equal('A parent workflow');
    expect(result.caStore).to.equal(false);
    expect(result.dcApiEnabled).to.equal(true);
    expect(result.wallets).to.eql(['cadmv-ios', 'cadmv-android']);
    expect(result.public).to.equal(true);
    expect(result.trustedCredentialIssuers).to.eql(['did:web:example.com']);
    expect(result.untrustedVariableAllowList).to.eql(['caseId']);
    expect(result.clientSecret).to.equal('parent-secret');
    expect(result.translations.en.qrTitle).to.equal('Parent Title');
    expect(result.oidc.redirectUri).to.equal(
      'https://parent.example.com/callback');
  });

  it('should NOT inherit type-specific fields from parent', function() {
    const child = {
      clientId: 'child-2',
      type: 'native',
      configFrom: 'parent-native',
      query: [{fields: {'org.iso.18013.5.1': ['family_name']},
        format: ['mso_mdoc']}]
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [baseNativeWorkflow, child],
      workflow: child
    });

    expect(result.query).to.eql(
      [{fields: {'org.iso.18013.5.1': ['family_name']},
        format: ['mso_mdoc']}]);
    expect(result.dcql_query).to.be(undefined);
    expect(result.verifiablePresentationRequest).to.be(undefined);
  });

  it('should not inherit type from parent', function() {
    const child = {
      clientId: 'child-3',
      configFrom: 'parent-native',
      query: [{type: ['OpenBadgeCredential'], format: ['ldp_vc']}]
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [baseNativeWorkflow, child],
      workflow: child
    });

    expect(result.type).to.be(undefined);
  });

  it('should merge brand: base → parent → child', function() {
    const child = {
      clientId: 'child-4',
      type: 'native',
      configFrom: 'parent-native',
      query: [{type: ['VerifiableCredential']}],
      brand: {
        homeLink: 'https://child.example.com',
        cta: '#444444'
      }
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [baseNativeWorkflow, child],
      workflow: child
    });

    expect(result.brand.cta).to.equal('#444444');
    expect(result.brand.homeLink).to.equal('https://child.example.com');
    expect(result.brand.primary).to.equal('#a11111');
    expect(result.brand.header).to.equal('#b11111');
  });

  it('should throw when parent also has configFrom (1-level limit)',
    function() {
      const grandparent = {
        clientId: 'grandparent',
        type: 'native',
        query: [{type: ['VerifiableCredential']}]
      };
      const parent = {
        clientId: 'parent-chained',
        type: 'native',
        configFrom: 'grandparent',
        query: [{type: ['VerifiableCredential']}]
      };
      const child = {
        clientId: 'child-chained',
        type: 'native',
        configFrom: 'parent-chained',
        query: [{type: ['VerifiableCredential']}]
      };

      expect(() => applyWorkflowDefaults({
        opencred,
        workflows: [grandparent, parent, child],
        workflow: child
      })).to.throwError(/only 1 level of inheritance/i);
    });

  it('should throw when configFrom target does not exist', function() {
    const child = {
      clientId: 'orphan',
      type: 'native',
      configFrom: 'nonexistent',
      query: [{type: ['VerifiableCredential']}]
    };

    expect(() => applyWorkflowDefaults({
      opencred,
      workflows: [child],
      workflow: child
    })).to.throwError(/not found/);
  });

  it('should throw when configFrom is not a string', function() {
    const child = {
      clientId: 'bad-ref',
      type: 'native',
      configFrom: 123,
      query: [{type: ['VerifiableCredential']}]
    };

    expect(() => applyWorkflowDefaults({
      opencred,
      workflows: [child],
      workflow: child
    })).to.throwError(/must be a string/);
  });

  it('should inherit only base fields in cross-type inheritance', function() {
    const entraParent = {
      clientId: 'entra-parent',
      clientSecret: 'entra-secret',
      type: 'microsoft-entra-verified-id',
      brand: {cta: '#555555', primary: '#666666', header: '#777777'},
      translations: {en: {qrTitle: 'Entra Parent'}},
      apiBaseUrl: 'https://verifiedid.example.com',
      apiLoginBaseUrl: 'https://login.example.com',
      apiTenantId: 'tenant-123',
      apiClientId: 'client-123',
      apiClientSecret: 'secret-123',
      verifierDid: 'did:web:example.com',
      verifierName: 'Example',
      acceptedCredentialType: 'Iso18013DriversLicenseCredential'
    };
    const child = {
      clientId: 'native-child',
      type: 'native',
      configFrom: 'entra-parent',
      query: [{fields: {'org.iso.18013.5.1': ['given_name']},
        format: ['mso_mdoc']}]
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [entraParent, child],
      workflow: child
    });

    expect(result.brand.cta).to.equal('#555555');
    expect(result.translations.en.qrTitle).to.equal('Entra Parent');
    expect(result.clientSecret).to.equal('entra-secret');

    expect(result.apiBaseUrl).to.be(undefined);
    expect(result.apiLoginBaseUrl).to.be(undefined);
    expect(result.apiTenantId).to.be(undefined);
    expect(result.verifierDid).to.be(undefined);
    expect(result.acceptedCredentialType).to.be(undefined);

    expect(result.type).to.equal('native');
    expect(result.query[0].format).to.eql(['mso_mdoc']);
  });

  it('should allow child to override inherited base fields', function() {
    const child = {
      clientId: 'child-override',
      type: 'native',
      configFrom: 'parent-native',
      clientSecret: 'child-secret',
      name: 'Child Name',
      public: false,
      caStore: true,
      query: [{type: ['VerifiableCredential']}]
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [baseNativeWorkflow, child],
      workflow: child
    });

    expect(result.clientSecret).to.equal('child-secret');
    expect(result.name).to.equal('Child Name');
    expect(result.public).to.equal(false);
    expect(result.caStore).to.equal(true);
  });

  it('resolveConfigFrom returns only inheritable fields', function() {
    const child = {
      clientId: 'direct-test',
      type: 'native',
      configFrom: 'parent-native'
    };

    const result = resolveConfigFrom({
      workflow: child,
      workflows: [baseNativeWorkflow, child]
    });

    expect(result.name).to.equal('Parent Workflow');
    expect(result.clientSecret).to.equal('parent-secret');
    expect(result.brand.cta).to.equal('#111111');

    expect(result.type).to.be(undefined);
    expect(result.clientId).to.be(undefined);
    expect(result.query).to.be(undefined);
    expect(result.dcql_query).to.be(undefined);
    expect(result.configFrom).to.be(undefined);
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

describe('Config - brand override behavior', function() {
  it('should merge partial brand override on top of defaultBrand', function() {
    const workflowWithPartialBrand = {
      clientId: 'test-partial',
      clientSecret: 'secret',
      type: 'native',
      query: [{
        type: ['VerifiableCredential']
      }],
      oidc: {
        redirectUri: 'https://example.com'
      },
      brand: {
        homeLink: 'https://example.com/home'
      }
    };

    const result = applyWorkflowDefaults({
      opencred: {
        defaultBrand: {
          cta: '#006847',
          primary: '#008f5a',
          header: '#004225'
        }
      },
      workflows: [workflowWithPartialBrand],
      workflow: workflowWithPartialBrand
    });

    // Should have all default brand properties plus the override
    expect(result.brand.cta).to.equal('#006847');
    expect(result.brand.primary).to.equal('#008f5a');
    expect(result.brand.header).to.equal('#004225');
    expect(result.brand.homeLink).to.equal('https://example.com/home');
  });
});

describe('Config - optional BrandSchema fields', function() {
  it('should parse defaultBrand with only optional fields', function() {
    const configWithPartialDefaultBrand = {
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
        homeLink: 'https://example.com/home'
      }
    };

    const result = OpenCredConfigSchema.parse(configWithPartialDefaultBrand);

    // Should have default values for cta, primary, header from DEFAULT_BRAND
    expect(result.defaultBrand.cta).to.equal('#006847');
    expect(result.defaultBrand.primary).to.equal('#008f5a');
    expect(result.defaultBrand.header).to.equal('#004225');
    expect(result.defaultBrand.homeLink).to.equal('https://example.com/home');
  });

  it('should parse workflow brand with only optional fields', function() {
    const configWithPartialWorkflowBrand = {
      workflows: [{
        clientId: 'test',
        clientSecret: 'secret',
        type: 'native',
        query: [{
          type: ['VerifiableCredential']
        }],
        oidc: {
          redirectUri: 'https://example.com'
        },
        brand: {
          homeLink: 'https://workflow.com/home'
        }
      }],
      defaultBrand: {
        cta: '#006847',
        primary: '#008f5a',
        header: '#004225'
      }
    };

    const result = OpenCredConfigSchema.parse(configWithPartialWorkflowBrand);

    // The workflow brand should be parsed with defaults applied
    // Note: applyWorkflowDefaults is called separately,
    // so we check the schema parsing
    expect(result.workflows[0].brand).to.be.an('object');
    expect(result.workflows[0].brand.homeLink).to.equal('https://workflow.com/home');
    // Schema should apply defaults during parsing
    expect(result.workflows[0].brand.cta).to.equal('#006847');
    expect(result.workflows[0].brand.primary).to.equal('#008f5a');
    expect(result.workflows[0].brand.header).to.equal('#004225');
  });
});
