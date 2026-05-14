import expect from 'expect.js';
import {verifyUtils} from '../../common/utils.js';

describe('VC Query Match', () => {
  // Test credentials without proofs for matching
  const driverLicenseVc = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/citizenship/v1'
    ],
    type: ['VerifiableCredential', 'DriverLicenseCredential'],
    credentialSubject: {
      id: 'did:example:holder123',
      givenName: 'John',
      familyName: 'Doe'
    }
  };

  const permanentResidentVc = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/citizenship/v1'
    ],
    type: ['VerifiableCredential', 'PermanentResidentCard'],
    credentialSubject: {
      id: 'did:example:holder456',
      givenName: 'Jane',
      familyName: 'Smith'
    }
  };

  const prototypeVc = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://www.w3.org/ns/credentials/examples/v2'
    ],
    type: ['VerifiableCredential', 'MyPrototypeCredential'],
    credentialSubject: {
      id: 'did:example:holder789',
      name: 'Test User'
    }
  };

  const wrongTypeVc = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1'
    ],
    type: ['VerifiableCredential', 'WrongCredentialType'],
    credentialSubject: {
      id: 'did:example:holder999',
      name: 'Wrong Type'
    }
  };

  const openBadgeVc = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
    ],
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    credentialSubject: {
      id: 'did:example:holder111',
      name: 'Test Badge'
    }
  };

  describe('DCQL Query Matching', () => {
    it('should match a credential that satisfies the DCQL query', async () => {
      const dcqlQuery = {
        credentials: [{
          id: 'permanent-resident-query',
          format: 'ldp_vc',
          meta: {
            type_values: [
              [
                'https://www.w3.org/2018/credentials#VerifiableCredential',
                'https://w3id.org/citizenship#PermanentResidentCard'
              ]
            ]
          }
        }]
      };

      const result = await verifyUtils.checkVcQueryMatch({
        vc: permanentResidentVc,
        dcql_query: dcqlQuery
      });

      expect(result).to.be(true);
    });

    it('should not match vc of wrong type specified in DCQL query',
      async () => {
        const dcqlQuery = {
          credentials: [{
            id: 'permanent-resident-query',
            format: 'ldp_vc',
            meta: {
              type_values: [
                [
                  'https://www.w3.org/2018/credentials#VerifiableCredential',
                  'https://w3id.org/citizenship#PermanentResidentCard'
                ]
              ]
            }
          }]
        };

        const result = await verifyUtils.checkVcQueryMatch({
          vc: wrongTypeVc,
          dcql_query: dcqlQuery
        });

        expect(result).to.be(false);
      });

    it('should match when VC types satisfy one of multiple type_values ' +
      'sub-arrays', async () => {
      const dcqlQuery = {
        credentials: [{
          id: 'multi-type-query',
          format: 'ldp_vc',
          meta: {
            type_values: [
              ['https://example.org/NonExistentType'],
              ['https://www.w3.org/2018/credentials#VerifiableCredential']
            ]
          }
        }]
      };

      const result = await verifyUtils.checkVcQueryMatch({
        vc: permanentResidentVc,
        dcql_query: dcqlQuery
      });

      expect(result).to.be(true);
    });
  });

  describe('Presentation Definition Matching', () => {
    it('should match vc that satisfies the presentation definition',
      async () => {
        const presentationDefinition = {
          id: 'test-presentation-definition',
          input_descriptors: [{
            id: 'permanent-resident-card',
            constraints: {
              fields: [
                {
                  path: '$[\'@context\']',
                  filter: {
                    type: 'array',
                    contains: [
                      {
                        type: 'string',
                        const: 'https://www.w3.org/2018/credentials/v1'
                      },
                      {
                        type: 'string',
                        const: 'https://w3id.org/citizenship/v1'
                      }
                    ]
                  }
                },
                {
                  path: '$[\'type\']',
                  filter: {
                    type: 'array',
                    contains: [
                      {
                        type: 'string',
                        const: 'PermanentResidentCard'
                      }
                    ]
                  }
                }
              ]
            }
          }]
        };

        const result = await verifyUtils.checkVcQueryMatch({
          vc: permanentResidentVc,
          presentation_definition: presentationDefinition
        });

        expect(result).to.be(true);
      });

    it('no match on vc that doesn\'t satisfy presentation definition',
      async () => {
        const presentationDefinition = {
          id: 'test-presentation-definition',
          input_descriptors: [{
            id: 'permanent-resident-card',
            constraints: {
              fields: [
                {
                  path: '$[\'@context\']',
                  filter: {
                    type: 'array',
                    contains: [
                      {
                        type: 'string',
                        const: 'https://www.w3.org/2018/credentials/v1'
                      },
                      {
                        type: 'string',
                        const: 'https://w3id.org/citizenship/v1'
                      }
                    ]
                  }
                },
                {
                  path: '$[\'type\']',
                  filter: {
                    type: 'array',
                    contains: [
                      {
                        type: 'string',
                        const: 'PermanentResidentCard'
                      }
                    ]
                  }
                }
              ]
            }
          }]
        };

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          presentation_definition: presentationDefinition
        });

        expect(result).to.be(false);
      });

    it('should match vc that satisfies presentation definition ' +
      'with allOf', async () => {
      const driverLicenseVcWithAllContexts = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://w3id.org/vdl/v1',
          'https://w3id.org/vdl/aamva/v1'
        ],
        type: ['VerifiableCredential', 'Iso18013DriversLicense'],
        credentialSubject: {
          id: 'did:example:holder123',
          givenName: 'John',
          familyName: 'Doe'
        }
      };

      const presentationDefinition = {
        id: 'test-presentation-definition',
        input_descriptors: [{
          id: 'driver-license',
          constraints: {
            fields: [
              {
                path: ['$[\'@context\']'],
                filter: {
                  type: 'array',
                  allOf: [
                    {
                      contains: {
                        type: 'string',
                        const: 'https://www.w3.org/2018/credentials/v1'
                      }
                    },
                    {
                      contains: {
                        type: 'string',
                        const: 'https://w3id.org/vdl/v1'
                      }
                    },
                    {
                      contains: {
                        type: 'string',
                        const: 'https://w3id.org/vdl/aamva/v1'
                      }
                    }
                  ]
                }
              },
              {
                path: '$[\'type\']',
                filter: {
                  type: 'array',
                  contains: [
                    {
                      type: 'string',
                      const: 'Iso18013DriversLicense'
                    }
                  ]
                }
              }
            ]
          }
        }]
      };

      const result = await verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVcWithAllContexts,
        presentation_definition: presentationDefinition
      });

      expect(result).to.be(true);
    });

    it('should not match vc missing required context in allOf', async () => {
      const driverLicenseVcMissingContext = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://w3id.org/vdl/v1'
          // Missing 'https://w3id.org/vdl/aamva/v1'
        ],
        type: ['VerifiableCredential', 'Iso18013DriversLicense'],
        credentialSubject: {
          id: 'did:example:holder123',
          givenName: 'John',
          familyName: 'Doe'
        }
      };

      const presentationDefinition = {
        id: 'test-presentation-definition',
        input_descriptors: [{
          id: 'driver-license',
          constraints: {
            fields: [
              {
                path: ['$[\'@context\']'],
                filter: {
                  type: 'array',
                  allOf: [
                    {
                      contains: {
                        type: 'string',
                        const: 'https://www.w3.org/2018/credentials/v1'
                      }
                    },
                    {
                      contains: {
                        type: 'string',
                        const: 'https://w3id.org/vdl/v1'
                      }
                    },
                    {
                      contains: {
                        type: 'string',
                        const: 'https://w3id.org/vdl/aamva/v1'
                      }
                    }
                  ]
                }
              }
            ]
          }
        }]
      };

      const result = await verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVcMissingContext,
        presentation_definition: presentationDefinition
      });

      expect(result).to.be(false);
    });
  });

  describe('VPR Matching', () => {
    it('should match a credential that satisfies the VPR', async () => {
      const vpr = {
        query: {
          type: 'QueryByExample',
          credentialQuery: {
            reason: 'Please present your prototype credential',
            example: {
              '@context': [
                'https://www.w3.org/ns/credentials/v2',
                'https://www.w3.org/ns/credentials/examples/v2'
              ],
              type: 'MyPrototypeCredential'
            }
          }
        }
      };

      const result = await verifyUtils.checkVcQueryMatch({
        vc: prototypeVc,
        vpr
      });

      expect(result).to.be(true);
    });

    it('should not match a credential that does not satisfy the VPR',
      async () => {
        const vpr = {
          query: {
            type: 'QueryByExample',
            credentialQuery: {
              reason: 'Please present your prototype credential',
              example: {
                '@context': [
                  'https://www.w3.org/ns/credentials/v2',
                  'https://www.w3.org/ns/credentials/examples/v2'
                ],
                type: 'MyPrototypeCredential'
              }
            }
          }
        };

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          vpr
        });

        expect(result).to.be(false);
      });
  });

  describe('Workflow Query Matching', () => {
    describe('Basic Matching', () => {
      it('should match credential that satisfies query with type only',
        async () => {
          const query = [{
            type: ['OpenBadgeCredential'],
            format: ['ldp_vc']
          }];

          const result = await verifyUtils.checkVcQueryMatch({
            vc: openBadgeVc,
            query
          });

          expect(result).to.be(true);
        });

      it('should match credential that satisfies query with context only',
        async () => {
          const query = [{
            context: ['https://www.w3.org/2018/credentials/v1']
          }];

          const result = await verifyUtils.checkVcQueryMatch({
            vc: driverLicenseVc,
            query
          });

          expect(result).to.be(true);
        });

      it('should match credential with both type and context', async () => {
        const query = [{
          type: ['DriverLicenseCredential'],
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/citizenship/v1'
          ]
        }];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });
    });

    describe('Non-Matching', () => {
      it('should not match when type doesn\'t match', async () => {
        const query = [{
          type: ['OpenBadgeCredential'],
          format: ['ldp_vc']
        }];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: wrongTypeVc,
          query
        });

        expect(result).to.be(false);
      });

      it('should not match when context doesn\'t match', async () => {
        const query = [{
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/nonexistent/v1'
          ]
        }];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(false);
      });

      it('should not match when type partially matches', async () => {
        const query = [{
          type: [
            'VerifiableCredential',
            'DriverLicenseCredential',
            'RequiredType'
          ]
        }];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(false);
      });
    });

    describe('Multiple Query Items', () => {
      it('should match when any query item matches', async () => {
        const query = [
          {
            type: ['NonExistentCredential']
          },
          {
            type: ['DriverLicenseCredential'],
            context: [
              'https://www.w3.org/2018/credentials/v1',
              'https://w3id.org/citizenship/v1'
            ]
          }
        ];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should not match when no query items match', async () => {
        const query = [
          {
            type: ['NonExistentCredential1']
          },
          {
            type: ['NonExistentCredential2']
          }
        ];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(false);
      });
    });

    describe('Edge Cases', () => {
      it('should return false for empty query array', async () => {
        const query = [];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(false);
      });

      it('should match when query has no type or context (format only)',
        async () => {
          const query = [{
            format: ['ldp_vc']
          }];

          const result = await verifyUtils.checkVcQueryMatch({
            vc: driverLicenseVc,
            query
          });

          expect(result).to.be(true);
        });

      it('should skip invalid query items and match valid ones',
        async () => {
          const query = [
            null,
            {
              type: ['DriverLicenseCredential']
            },
            'invalid'
          ];

          const result = await verifyUtils.checkVcQueryMatch({
            vc: driverLicenseVc,
            query
          });

          expect(result).to.be(true);
        });

      it('should ignore empty type array in query item', async () => {
        const query = [{
          type: [],
          context: ['https://www.w3.org/2018/credentials/v1']
        }];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should ignore empty context array in query item', async () => {
        const query = [{
          type: ['DriverLicenseCredential'],
          context: []
        }];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });
    });

    describe('Priority', () => {
      it('should use query when vpr is not present', async () => {
        const query = [{
          type: ['DriverLicenseCredential']
        }];

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should use vpr when both vpr and query are present', async () => {
        const vpr = {
          query: {
            type: 'QueryByExample',
            credentialQuery: {
              reason: 'Test',
              example: {
                '@context': [
                  'https://www.w3.org/ns/credentials/v2',
                  'https://www.w3.org/ns/credentials/examples/v2'
                ],
                type: 'MyPrototypeCredential'
              }
            }
          }
        };

        const query = [{
          type: ['DriverLicenseCredential']
        }];

        // vpr should take priority, so it should match prototypeVc,
        // not driverLicenseVc
        const resultWithPrototype = await verifyUtils.checkVcQueryMatch({
          vc: prototypeVc,
          vpr,
          query
        });

        const resultWithDriverLicense = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          vpr,
          query
        });

        expect(resultWithPrototype).to.be(true);
        expect(resultWithDriverLicense).to.be(false);
      });

      it('should use dcql_query when both dcql_query and query present',
        async () => {
          const dcqlQuery = {
            credentials: [{
              id: 'test',
              format: 'ldp_vc',
              meta: {
                type_values: [
                  [
                    'https://www.w3.org/2018/credentials#VerifiableCredential',
                    'https://w3id.org/citizenship#PermanentResidentCard'
                  ]
                ]
              }
            }]
          };

          const query = [{
            type: ['NonExistentCredential']
          }];

          const result = await verifyUtils.checkVcQueryMatch({
            vc: permanentResidentVc,
            dcql_query: dcqlQuery,
            query
          });

          expect(result).to.be(true);
        });

      it('should use presentation_definition when both present', async () => {
        const presentationDefinition = {
          id: 'test-presentation-definition',
          input_descriptors: [{
            id: 'permanent-resident-card',
            constraints: {
              fields: [
                {
                  path: '$[\'type\']',
                  filter: {
                    type: 'array',
                    contains: [
                      {
                        type: 'string',
                        const: 'PermanentResidentCard'
                      }
                    ]
                  }
                }
              ]
            }
          }]
        };

        const query = [{
          type: ['NonExistentCredential']
        }];

        // presentation_definition should take priority
        const resultWithPermanentResident =
          await verifyUtils.checkVcQueryMatch({
            vc: permanentResidentVc,
            presentation_definition: presentationDefinition,
            query
          });

        const resultWithDriverLicense =
          await verifyUtils.checkVcQueryMatch({
            vc: driverLicenseVc,
            presentation_definition: presentationDefinition,
            query
          });

        expect(resultWithPermanentResident).to.be(true);
        expect(resultWithDriverLicense).to.be(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should allow both dcql_query and presentation_definition ' +
      '(dcql_query takes priority)', async () => {
      const dcqlQuery = {
        credentials: [{
          id: 'test',
          format: 'ldp_vc',
          meta: {
            type_values: [
              [
                'https://www.w3.org/2018/credentials#VerifiableCredential',
                'https://w3id.org/citizenship#PermanentResidentCard'
              ]
            ]
          }
        }]
      };

      const presentationDefinition = {
        input_descriptors: [{
          constraints: {
            fields: []
          }
        }]
      };

      const result = await verifyUtils.checkVcQueryMatch({
        vc: permanentResidentVc,
        dcql_query: dcqlQuery,
        presentation_definition: presentationDefinition
      });
      expect(result).to.be(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle VPR with unsupported query type', async () => {
      const vpr = {
        query: {
          type: 'UnsupportedQueryType',
          credentialQuery: {
            reason: 'Test',
            example: {type: 'TestCredential'}
          }
        }
      };

      const result = await verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        vpr
      });

      expect(result).to.be(false);
    });

    it('should handle DCQL query with no credentials', async () => {
      const dcqlQuery = {
        credentials: []
      };

      const result = await verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        dcql_query: dcqlQuery
      });

      expect(result).to.be(false);
    });

    it('should handle presentation definition w/out input descriptors',
      async () => {
        const presentationDefinition = {
          input_descriptors: []
        };

        const result = await verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          presentation_definition: presentationDefinition
        });

        expect(result).to.be(false);
      });
  });
});
