const workflow = {
  type: 'native',
  dcql_query: {
    credentials: [
      {
        id: 'Iso18013DriversLicenseCredential',
        format: 'jwt_vc_json',
        multiple: false,
        require_cryptographic_holder_binding: true,
        claims: [
          {
            id: 'c:VCDM1.1',
            path: ['$.vc.context'],
            values: [
              'https://www.w3.org/2018/credentials/v1'
            ]
          },
          {
            id: 'c:VDL1',
            path: ['$.vc.context'],
            values: [
              'https://w3id.org/vdl/v1'
            ]
          },
          {
            id: 'c:AAMVA1',
            path: ['$.vc.context'],
            values: [
              'https://w3id.org/vdl/aamva/v1'
            ]
          }
        ],
        meta: {
          type_values: [
            [
              'https://www.w3.org/2018/credentials#VerifiableCredential',
              'https://w3id.org/vdl#Iso18013DriversLicenseCredential'
            ]
          ]
        }
      }
    ]
  },
  query: [
    {
      type: ['Iso18013DriversLicenseCredential'],
      context: [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/vdl/v1',
        'https://w3id.org/vdl/aamva/v1'
      ],
      format: ['jwt_vc_json']
    }
  ]
};

const auditConfig = {
  name: 'Driver\'s License or ID Card',
  fields: [
    {
      type: 'text',
      id: 'given_name',
      name: 'First Name',
      path: '$.credentialSubject.driversLicense.given_name',
      required: false
    },
    {
      type: 'text',
      id: 'family_name',
      name: 'Last Name',
      path: '$.credentialSubject.driversLicense.family_name',
      required: false
    },
    {
      type: 'date',
      id: 'birth_date',
      name: 'Date of Birth',
      path: '$.credentialSubject.driversLicense.birth_date',
      required: false
    },
    {
      type: 'dropdown',
      id: 'sex',
      name: 'Sex',
      path: '$.credentialSubject.driversLicense.sex',
      required: false,
      options: {
        Male: 1,
        Female: 2,
        'Not Known': 0,
        'Not Applicable': 9
      },
      default: 'Male'
    },
    {
      type: 'dropdown',
      id: 'aamva_veteran',
      name: 'Are you a veteran?',
      path: '$.credentialSubject.driversLicense.aamva_veteran',
      required: false,
      options: {
        Yes: 1,
        No: null
      },
      default: 'No'
    },
    {
      type: 'text',
      id: 'issuing_authority',
      name: 'Issuing Authority',
      path: '$.credentialSubject.driversLicense.issuing_authority',
      required: true,
      default: 'CA,USA'
    },
    {
      type: 'number',
      id: 'id_number',
      name: 'ID Number',
      path: '$.credentialSubject.driversLicense.somenumber',
      required: false,
      default: 0.5
    },
    {
      type: 'text',
      id: 'document_number',
      name: 'DL/ID Number',
      path: '$.credentialSubject.driversLicense.document_number',
      required: true
    },
    {
      type: 'dropdown',
      id: 'aamva_dhs_compliance',
      name: 'REAL ID Compliance',
      path: '$.credentialSubject.driversLicense.aamva_dhs_compliance',
      required: false,
      options: {
        'Fully Compliant': 'Y',
        'Non-Compliant': 'N'
      },
      default: 'N'
    },
    {
      type: 'date',
      id: 'issue_date',
      name: 'Issue Date',
      path: '$.credentialSubject.driversLicense.issue_date',
      required: false,
      default: '2023-01-01'
    },
    {
      type: 'date',
      id: 'expiry_date',
      name: 'Expiry Date',
      path: '$.credentialSubject.driversLicense.expiry_date',
      required: false
    }
  ]
};

export const preset = {
  preset: 'Iso18013DriversLicenseCredential:2025',
  workflow,
  auditConfig
};
