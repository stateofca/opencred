/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  applyWorkflowDefaults,
  mergeTranslations,
  OpenCredConfigSchema,
  resolveConfigFrom
} from '../../configs/config-utils.js';
import {
  validateWorkflowIdentifiers
} from '../../configs/config.js';

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
    context: ['https://www.w3.org/2018/credentials/v1', 'https://w3id.org/vdl/v1'],
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
      query: [{type: ['OpenBadgeCredential'],
        context: ['https://www.w3.org/ns/credentials/v2'],
        format: ['ldp_vc']}]
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
      query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}],
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
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
      };
      const parent = {
        clientId: 'parent-chained',
        type: 'native',
        configFrom: 'grandparent',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
      };
      const child = {
        clientId: 'child-chained',
        type: 'native',
        configFrom: 'parent-chained',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
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
      query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
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
      query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
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
      query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
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
          type: ['VerifiableCredential'],
          context: ['https://www.w3.org/ns/credentials/v2']
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
          type: ['VerifiableCredential'],
          context: ['https://www.w3.org/ns/credentials/v2']
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
        type: ['VerifiableCredential'],
        context: ['https://www.w3.org/ns/credentials/v2']
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

describe('Config - workflowId schema and uniqueness', function() {
  it('should accept a workflow with a valid workflowId', function() {
    const cfg = {
      workflows: [{
        clientId: 'test-client',
        clientSecret: 'secret',
        workflowId: 'my-legacy-slug',
        type: 'native',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
      }],
      defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
    };
    const result = OpenCredConfigSchema.parse(cfg);
    expect(result.workflows[0].workflowId).to.equal('my-legacy-slug');
  });

  it('should accept a workflow without workflowId', function() {
    const cfg = {
      workflows: [{
        clientId: 'test-client',
        clientSecret: 'secret',
        type: 'native',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
      }],
      defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
    };
    const result = OpenCredConfigSchema.parse(cfg);
    expect(result.workflows[0].workflowId).to.be(undefined);
  });

  it('should reject workflowId with invalid characters', function() {
    const cfg = {
      workflows: [{
        clientId: 'test-client',
        clientSecret: 'secret',
        workflowId: 'has spaces!',
        type: 'native',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
      }],
      defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
    };
    expect(() => OpenCredConfigSchema.parse(cfg)).to.throwError();
  });
});

describe('Config - workflowId not inherited via configFrom', function() {
  it('should not inherit workflowId from parent', function() {
    const parent = {
      ...baseNativeWorkflow,
      workflowId: 'parent-slug'
    };
    const child = {
      clientId: 'child-wfid',
      type: 'native',
      configFrom: 'parent-native',
      query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [parent, child],
      workflow: child
    });

    expect(result.workflowId).to.be(undefined);
  });

  it('resolveConfigFrom should not include workflowId', function() {
    const parent = {
      ...baseNativeWorkflow,
      workflowId: 'parent-slug'
    };
    const child = {
      clientId: 'child-resolve',
      type: 'native',
      configFrom: 'parent-native'
    };

    const result = resolveConfigFrom({
      workflow: child,
      workflows: [parent, child]
    });

    expect(result.workflowId).to.be(undefined);
  });
});

describe('Config - workflow identifier uniqueness', function() {
  it('should throw on duplicate clientId', function() {
    const cfg = {
      workflows: [
        {clientId: 'dup', clientSecret: 's1', type: 'native',
          query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]},
        {clientId: 'dup', clientSecret: 's2', type: 'native',
          query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]}
      ]
    };
    const parsed = OpenCredConfigSchema.parse({
      ...cfg,
      defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
    });
    expect(() => validateWorkflowIdentifiers(parsed))
      .to.throwError(/Duplicate clientId "dup"/);
  });

  it('should throw on duplicate workflowId', function() {
    const cfg = {
      workflows: [
        {clientId: 'a', clientSecret: 's1', workflowId: 'same-slug',
          type: 'native', query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]},
        {clientId: 'b', clientSecret: 's2', workflowId: 'same-slug',
          type: 'native', query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]}
      ]
    };
    const parsed = OpenCredConfigSchema.parse({
      ...cfg,
      defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
    });
    expect(() => validateWorkflowIdentifiers(parsed))
      .to.throwError(/Duplicate workflowId "same-slug"/);
  });

  it('should not throw when workflowIds are unique', function() {
    const cfg = {
      workflows: [
        {clientId: 'a', clientSecret: 's1', workflowId: 'slug-a',
          type: 'native', query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]},
        {clientId: 'b', clientSecret: 's2', workflowId: 'slug-b',
          type: 'native', query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]}
      ]
    };
    const parsed = OpenCredConfigSchema.parse({
      ...cfg,
      defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
    });
    expect(() => validateWorkflowIdentifiers(parsed)).to.not.throwError();
  });

  it('should not throw when no workflowIds are set', function() {
    const cfg = {
      workflows: [
        {clientId: 'x', clientSecret: 's1', type: 'native',
          query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]},
        {clientId: 'y', clientSecret: 's2', type: 'native',
          query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]}
      ]
    };
    const parsed = OpenCredConfigSchema.parse({
      ...cfg,
      defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
    });
    expect(() => validateWorkflowIdentifiers(parsed)).to.not.throwError();
  });

  it('should not throw on cross-collision (warns only)', function() {
    const cfg = {
      workflows: [
        {clientId: 'foo', clientSecret: 's1', type: 'native',
          query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]},
        {clientId: 'bar', clientSecret: 's2', workflowId: 'foo',
          type: 'native', query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]}
      ]
    };
    const parsed = OpenCredConfigSchema.parse({
      ...cfg,
      defaultBrand: {cta: '#006847', primary: '#008f5a', header: '#004225'}
    });
    expect(() => validateWorkflowIdentifiers(parsed)).to.not.throwError();
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
          type: ['VerifiableCredential'],
          context: ['https://www.w3.org/ns/credentials/v2']
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
          type: ['VerifiableCredential'],
          context: ['https://www.w3.org/ns/credentials/v2']
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

describe('Config - configFrom translations deep merge', function() {
  it('should deep-merge parent and child translations per locale', function() {
    const parent = {
      ...baseNativeWorkflow,
      translations: {
        en: {copyright: 'Parent ©', appTitle: 'Parent App'}
      }
    };
    const child = {
      clientId: 'child-trans-merge',
      type: 'native',
      configFrom: 'parent-native',
      query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}],
      translations: {
        en: {appTitle: 'Child App', qrPageExplain: 'Child QR'}
      }
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [parent, child],
      workflow: child
    });

    // Parent key preserved
    expect(result.translations.en.copyright).to.equal('Parent ©');
    // Child overrides parent key
    expect(result.translations.en.appTitle).to.equal('Child App');
    // Child-only key present
    expect(result.translations.en.qrPageExplain).to.equal('Child QR');
  });

  it('should inherit parent translations wholesale when child has none',
    function() {
      const parent = {
        ...baseNativeWorkflow,
        translations: {
          en: {copyright: 'Parent ©', appTitle: 'Parent App'}
        }
      };
      const child = {
        clientId: 'child-no-trans',
        type: 'native',
        configFrom: 'parent-native',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
      };

      const result = applyWorkflowDefaults({
        opencred,
        workflows: [parent, child],
        workflow: child
      });

      expect(result.translations.en.copyright).to.equal('Parent ©');
      expect(result.translations.en.appTitle).to.equal('Parent App');
    });

  it('should pass child translations through when parent has none',
    function() {
      const parent = {
        clientId: 'parent-native',
        clientSecret: 'parent-secret',
        type: 'native',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}]
      };
      const child = {
        clientId: 'child-only-trans',
        type: 'native',
        configFrom: 'parent-native',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}],
        translations: {
          en: {appTitle: 'Child Only'}
        }
      };

      const result = applyWorkflowDefaults({
        opencred,
        workflows: [parent, child],
        workflow: child
      });

      expect(result.translations.en.appTitle).to.equal('Child Only');
    });

  it('should handle multiple locales independently', function() {
    const parent = {
      ...baseNativeWorkflow,
      translations: {
        en: {copyright: 'English ©', appTitle: 'EN Title'},
        es: {copyright: 'Spanish ©', appTitle: 'ES Title'}
      }
    };
    const child = {
      clientId: 'child-multi-locale',
      type: 'native',
      configFrom: 'parent-native',
      query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}],
      translations: {
        en: {appTitle: 'Child EN Title'}
      }
    };

    const result = applyWorkflowDefaults({
      opencred,
      workflows: [parent, child],
      workflow: child
    });

    // en: child overrides appTitle, parent copyright preserved
    expect(result.translations.en.appTitle).to.equal('Child EN Title');
    expect(result.translations.en.copyright).to.equal('English ©');
    // es: inherited wholesale from parent
    expect(result.translations.es.copyright).to.equal('Spanish ©');
    expect(result.translations.es.appTitle).to.equal('ES Title');
  });

  it('should allow empty-string override to blank out a parent key',
    function() {
      const parent = {
        ...baseNativeWorkflow,
        translations: {
          en: {copyright: 'Parent ©'}
        }
      };
      const child = {
        clientId: 'child-blank',
        type: 'native',
        configFrom: 'parent-native',
        query: [{type: ['VerifiableCredential'], context: ['https://www.w3.org/ns/credentials/v2']}],
        translations: {
          en: {copyright: ''}
        }
      };

      const result = applyWorkflowDefaults({
        opencred,
        workflows: [parent, child],
        workflow: child
      });

      expect(result.translations.en.copyright).to.equal('');
    });
});

describe('Config - mergeTranslations helper', function() {
  it('should return undefined when both inputs are falsy', function() {
    expect(mergeTranslations(undefined, undefined)).to.be(undefined);
    expect(mergeTranslations(null, null)).to.be(undefined);
  });

  it('should return child when parent is falsy', function() {
    const child = {en: {title: 'Hello'}};
    expect(mergeTranslations(undefined, child)).to.eql(child);
  });

  it('should return parent when child is falsy', function() {
    const parent = {en: {title: 'Hello'}};
    expect(mergeTranslations(parent, undefined)).to.eql(parent);
  });

  it('should not mutate input objects', function() {
    const parent = {en: {a: '1', b: '2'}};
    const child = {en: {b: '3', c: '4'}};
    const parentCopy = JSON.parse(JSON.stringify(parent));
    const childCopy = JSON.parse(JSON.stringify(child));

    mergeTranslations(parent, child);

    expect(parent).to.eql(parentCopy);
    expect(child).to.eql(childCopy);
  });
});
