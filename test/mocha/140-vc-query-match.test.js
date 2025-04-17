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

  describe('Error Handling', () => {
    it('should throw error if no query type is specified', () => {
      expect(() => {
        verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc
        });
      }).to.throwError('Exactly one query type must be specified: ' +
        'vpr, dcql_query, or presentation_definition');
    });

    it('should throw error if multiple query types are specified', () => {
      const vpr = {
        query: {
          type: 'QueryByExample',
          credentialQuery: {
            reason: 'Test',
            example: {type: 'TestCredential'}
          }
        }
      };

      const dcqlQuery = {
        credentials: [{
          id: 'test',
          format: 'ldp_vc',
          meta: {}
        }]
      };

      expect(() => {
        verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          vpr,
          dcql_query: dcqlQuery
        });
      }).to.throwError('Only one query type can be specified at a time:' +
        ' vpr, dcql_query, or presentation_definition');
    });

    it('should throw error for overloaded requirements', () => {
      const vpr = {
        query: {
          type: 'QueryByExample',
          credentialQuery: {
            reason: 'Test',
            example: {type: 'TestCredential'}
          }
        }
      };

      const presentationDefinition = {
        input_descriptors: [{
          constraints: {
            fields: []
          }
        }]
      };

      expect(() => {
        verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          vpr,
          presentation_definition: presentationDefinition
        });
      }).to.throwError('Only one query type can be specified at a time:' +
        ' vpr, dcql_query, or presentation_definition');
    });

    it('should throw for both dcql_query and presentation_definition', () => {
      const dcqlQuery = {
        credentials: [{
          id: 'test',
          format: 'ldp_vc',
          meta: {}
        }]
      };

      const presentationDefinition = {
        input_descriptors: [{
          constraints: {
            fields: []
          }
        }]
      };

      expect(() => {
        verifyUtils.checkVcQueryMatch({
          vc: driverLicenseVc,
          dcql_query: dcqlQuery,
          presentation_definition: presentationDefinition
        });
      }).to.throwError('Only one query type can be specified at a time:' +
        ' vpr, dcql_query, or presentation_definition');
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
