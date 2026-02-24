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
    it('should match a credential that satisfies the DCQL query', () => {
      const dcqlQuery = {
        credentials: [{
          id: 'driver-license-query',
          format: 'ldp_vc',
          meta: {
            '@context': [
              'https://www.w3.org/2018/credentials/v1',
              'https://w3id.org/citizenship/v1'
            ],
            type: ['VerifiableCredential', 'DriverLicenseCredential']
          }
        }]
      };

      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        dcql_query: dcqlQuery
      });

      expect(result).to.be(true);
    });

    it('should not match vc of wrong type specified in DCQL query', () => {
      const dcqlQuery = {
        credentials: [{
          id: 'driver-license-query',
          format: 'ldp_vc',
          meta: {
            '@context': [
              'https://www.w3.org/2018/credentials/v1',
              'https://w3id.org/citizenship/v1'
            ],
            type: ['VerifiableCredential', 'DriverLicenseCredential']
          }
        }]
      };

      const result = verifyUtils.checkVcQueryMatch({
        vc: wrongTypeVc,
        dcql_query: dcqlQuery
      });

      expect(result).to.be(false);
    });
  });

  describe('Presentation Definition Matching', () => {
    it('should match vc that satisfies the presentation definition', () => {
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

      const result = verifyUtils.checkVcQueryMatch({
        vc: permanentResidentVc,
        presentation_definition: presentationDefinition
      });

      expect(result).to.be(true);
    });

    it('no match on vc that doesn\'t satisfy presentation definition', () => {
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

      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        presentation_definition: presentationDefinition
      });

      expect(result).to.be(false);
    });

    it('should match vc that satisfies presentation definition ' +
      'with allOf', () => {
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

      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVcWithAllContexts,
        presentation_definition: presentationDefinition
      });

      expect(result).to.be(true);
    });

    it('should not match vc missing required context in allOf', () => {
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

      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVcMissingContext,
        presentation_definition: presentationDefinition
      });

      expect(result).to.be(false);
    });
  });

  describe('VPR Matching', () => {
    it('should match a credential that satisfies the VPR', () => {
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

      const result = verifyUtils.checkVcQueryMatch({
        vc: prototypeVc,
        vpr
      });

      expect(result).to.be(true);
    });

    it('should not match a credential that does not satisfy the VPR', () => {
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

      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        vpr
      });

      expect(result).to.be(false);
    });
  });

  describe('Workflow Query Matching', () => {
    describe('Basic Matching', () => {
      it('should match credential that satisfies query with type only', () => {
        const query = [{
          type: ['OpenBadgeCredential'],
          format: ['ldp_vc']
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: openBadgeVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should match credential that satisfies query with context only',
        () => {
          const query = [{
            context: ['https://www.w3.org/2018/credentials/v1']
          }];

          const result = verifyUtils.checkVcQueryMatch({
            vc: driverLicenseVc,
            query
          });

          expect(result).to.be(true);
        });

      it('should match credential with both type and context', () => {
        const query = [{
          type: ['DriverLicenseCredential'],
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/citizenship/v1'
          ]
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });
    });

    describe('Non-Matching', () => {
      it('should not match when type doesn\'t match', () => {
        const query = [{
          type: ['OpenBadgeCredential'],
          format: ['ldp_vc']
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: wrongTypeVc,
          query
        });

        expect(result).to.be(false);
      });

      it('should not match when context doesn\'t match', () => {
        const query = [{
          context: [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/nonexistent/v1'
          ]
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(false);
      });

      it('should not match when type partially matches', () => {
        const query = [{
          type: [
            'VerifiableCredential',
            'DriverLicenseCredential',
            'RequiredType'
          ]
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(false);
      });
    });

    describe('Multiple Query Items', () => {
      it('should match when any query item matches', () => {
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

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should not match when no query items match', () => {
        const query = [
          {
            type: ['NonExistentCredential1']
          },
          {
            type: ['NonExistentCredential2']
          }
        ];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(false);
      });
    });

    describe('Edge Cases', () => {
      it('should return false for empty query array', () => {
        const query = [];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(false);
      });

      it('should match when query has no type or context (format only)', () => {
        const query = [{
          format: ['ldp_vc']
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should skip invalid query items and match valid ones', () => {
        const query = [
          null,
          {
            type: ['DriverLicenseCredential']
          },
          'invalid'
        ];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should ignore empty type array in query item', () => {
        const query = [{
          type: [],
          context: ['https://www.w3.org/2018/credentials/v1']
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should ignore empty context array in query item', () => {
        const query = [{
          type: ['DriverLicenseCredential'],
          context: []
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });
    });

    describe('Priority', () => {
      it('should use query when vpr is not present', () => {
        const query = [{
          type: ['DriverLicenseCredential']
        }];

        const result = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          query
        });

        expect(result).to.be(true);
      });

      it('should use vpr when both vpr and query are present', () => {
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
        const resultWithPrototype = verifyUtils.checkVcQueryMatch({
          vc: prototypeVc,
          vpr,
          query
        });

        const resultWithDriverLicense = verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          vpr,
          query
        });

        expect(resultWithPrototype).to.be(true);
        expect(resultWithDriverLicense).to.be(false);
      });

      it('should use dcql_query when both dcql_query and query present',
        () => {
          const dcqlQuery = {
            credentials: [{
              id: 'test',
              format: 'ldp_vc',
              meta: {
                '@context': [
                  'https://www.w3.org/2018/credentials/v1',
                  'https://w3id.org/citizenship/v1'
                ],
                type: ['VerifiableCredential', 'DriverLicenseCredential']
              }
            }]
          };

          const query = [{
            type: ['NonExistentCredential']
          }];

          // dcql_query should take priority, so it should match driverLicenseVc
          const result = verifyUtils.checkVcQueryMatch({
            vc: driverLicenseVc,
            dcql_query: dcqlQuery,
            query
          });

          expect(result).to.be(true);
        });

      it('should use presentation_definition when both present', () => {
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
        const resultWithPermanentResident = verifyUtils.checkVcQueryMatch({
          vc: permanentResidentVc,
          presentation_definition: presentationDefinition,
          query
        });

        const resultWithDriverLicense = verifyUtils.checkVcQueryMatch({
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
      '(dcql_query takes priority)', () => {
      const dcqlQuery = {
        credentials: [{
          id: 'test',
          format: 'ldp_vc',
          meta: {
            '@context': [
              'https://www.w3.org/2018/credentials/v1',
              'https://w3id.org/citizenship/v1'
            ],
            type: ['VerifiableCredential', 'DriverLicenseCredential']
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

      // Should not throw - both are allowed for backward compatibility
      // dcql_query takes priority
      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        dcql_query: dcqlQuery,
        presentation_definition: presentationDefinition
      });
      expect(result).to.be(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle VPR with unsupported query type', () => {
      const vpr = {
        query: {
          type: 'UnsupportedQueryType',
          credentialQuery: {
            reason: 'Test',
            example: {type: 'TestCredential'}
          }
        }
      };

      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        vpr
      });

      expect(result).to.be(false);
    });

    it('should handle DCQL query with no credentials', () => {
      const dcqlQuery = {
        credentials: []
      };

      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        dcql_query: dcqlQuery
      });

      expect(result).to.be(false);
    });

    it('should handle presentation definition w/out input descriptors', () => {
      const presentationDefinition = {
        input_descriptors: []
      };

      const result = verifyUtils.checkVcQueryMatch({
        vc: driverLicenseVc,
        presentation_definition: presentationDefinition
      });

      expect(result).to.be(false);
    });
  });
});
