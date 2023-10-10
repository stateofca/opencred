import * as DidKey from '@digitalbazaar/did-method-key';
import * as DidWeb from '@interop/did-web-resolver';
import {
  CONTEXT as DI_CONTEXT,
  CONTEXT_URL as DI_CONTEXT_URL
} from '@digitalbazaar/data-integrity-context';
import {
  CONTEXT_V1 as SL_V1_CONTEXT,
  CONTEXT_URL_V1 as SL_V1_CONTEXT_URL
} from '@digitalbazaar/vc-status-list-context';
import {CachedResolver} from '@digitalbazaar/did-io';
import {Ed25519VerificationKey2020}
  from '@digitalbazaar/ed25519-verification-key-2020';
import {X25519KeyAgreementKey2020}
  from '@digitalbazaar/x25519-key-agreement-key-2020';
import {
  CONTEXT as CRED_CONTEXT,
  CONTEXT_URL as CRED_CONTEXT_URL
} from 'credentials-context';
import {
  CONTEXT as DID_CONTEXT,
  CONTEXT_URL as DID_CONTEXT_URL
} from 'did-context';
import {
  CONTEXT as ED_SIG_2020_CONTEXT,
  CONTEXT_URL as ED_SIG_2020_CONTEXT_URL
} from 'ed25519-signature-2020-context';
import {CryptoLD} from 'crypto-ld';
import {JsonLdDocumentLoader} from 'jsonld-document-loader';
import X25519KeyAgreement2020Context from 'x25519-key-agreement-2020-context';

// TODO: create a vdl context repo in digitalbazaar github?
const VDL_CONTEXT_URL = 'https://w3id.org/vdl/aamva/v1';
const VDL_CONTEXT = {
  '@context': {
    '@protected': true,
    aamva_aka_family_name_v2: 'https://w3id.org/vdl/aamva#akaFamilyNameV2',
    aamva_aka_given_name_v2: 'https://w3id.org/vdl/aamva#akaGivenNameV2',
    aamva_aka_suffix: 'https://w3id.org/vdl/aamva#akaSuffix',
    aamva_cdl_indicator: {
      '@id': 'https://w3id.org/vdl/aamva#cdlIndicator',
      '@type': 'http://www.w3.org/2001/XMLSchema#unsignedInt'
    },
    aamva_dhs_compliance: 'https://w3id.org/vdl/aamva#dhsCompliance',
    aamva_dhs_compliance_text: 'https://w3id.org/vdl/aamva#dhsCompliance_text',
    aamva_dhs_temporary_lawful_status: {
      '@id': 'https://w3id.org/vdl/aamva#dhsTemporaryLawfulStatus',
      '@type': 'http://www.w3.org/2001/XMLSchema#unsignedInt'
    },
    aamva_domestic_driving_privileges: {
      '@id': 'https://w3id.org/vdl/aamva#domesticDrivingPrivileges',
      '@type': '@json'
    },
    aamva_edl_credential: {
      '@id': 'https://w3id.org/vdl/aamva#edlCredential',
      '@type': 'http://www.w3.org/2001/XMLSchema#unsignedInt'
    },
    aamva_family_name_truncation:
      'https://w3id.org/vdl/aamva#familyNameTruncation',
    aamva_given_name_truncation:
      'https://w3id.org/vdl/aamva#givenNameTruncation',
    aamva_hazmat_endorsement_expiration_date: {
      '@id': 'https://w3id.org/vdl/aamva#hazmatEndorsementExpirationDate',
      '@type': 'https://www.rfc-editor.org/rfc/rfc3339#full-date'
    },
    aamva_name_suffix: 'https://w3id.org/vdl/aamva#nameSuffix',
    aamva_organ_donor: {
      '@id': 'https://w3id.org/vdl/aamva#organDonor',
      '@type': 'http://www.w3.org/2001/XMLSchema#unsignedInt'
    },
    aamva_race_ethnicity: 'https://w3id.org/vdl/aamva#raceEthnicity',
    aamva_resident_county: 'https://w3id.org/vdl/aamva#residentCounty',
    aamva_sex: {
      '@id': 'https://w3id.org/vdl/aamva#sex',
      '@type': 'http://www.w3.org/2001/XMLSchema#unsignedInt'
    },
    aamva_veteran: {
      '@id': 'https://w3id.org/vdl/aamva#veteran',
      '@type': 'http://www.w3.org/2001/XMLSchema#unsignedInt'
    },
    aamva_weight_range: {
      '@id': 'https://w3id.org/vdl/aamva#weightRange',
      '@type': 'http://www.w3.org/2001/XMLSchema#unsignedInt'
    }
  }
};

const cryptoLd = new CryptoLD();
cryptoLd.use(Ed25519VerificationKey2020);
cryptoLd.use(X25519KeyAgreementKey2020);

const didWebDriver = DidWeb.driver({cryptoLd});
const didKeyDriver = DidKey.driver();
didKeyDriver.use({
  name: 'Ed25519',
  handler: Ed25519VerificationKey2020,
  multibaseMultikeyHeader: 'z6Mk',
  fromMultibase: DidKey.createFromMultibase(Ed25519VerificationKey2020)
});

const didResolver = new CachedResolver();
didResolver.use(didWebDriver);
didResolver.use(didKeyDriver);

const getDocumentLoader = ({dynamic = false} = {}) => {
  const jsonLdDocLoader = new JsonLdDocumentLoader();

  jsonLdDocLoader.addStatic(ED_SIG_2020_CONTEXT_URL, ED_SIG_2020_CONTEXT);
  jsonLdDocLoader.addStatic(
    X25519KeyAgreement2020Context.constants.CONTEXT_URL,
    X25519KeyAgreement2020Context.contexts.get(
      X25519KeyAgreement2020Context.constants.CONTEXT_URL));
  jsonLdDocLoader.addStatic(DI_CONTEXT_URL, DI_CONTEXT);
  jsonLdDocLoader.addStatic(DID_CONTEXT_URL, DID_CONTEXT);
  jsonLdDocLoader.addStatic(CRED_CONTEXT_URL, CRED_CONTEXT);
  jsonLdDocLoader.addStatic(SL_V1_CONTEXT_URL, SL_V1_CONTEXT);
  jsonLdDocLoader.addStatic(VDL_CONTEXT_URL, VDL_CONTEXT);

  jsonLdDocLoader.setDidResolver(didResolver);
  if(dynamic) {
    const webHandler = {
      get: async ({url}) => {
        const getConfig = {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache'
          },
          // max size for any JSON doc (in bytes, ~8 KiB)
          size: 8192,
          // timeout in ms for fetching any document
          timeout: 5000
        };
        return (await fetch(url, getConfig)).json();
      }
    };
    jsonLdDocLoader.setProtocolHandler({
      protocol: 'http',
      handler: webHandler
    });
    jsonLdDocLoader.setProtocolHandler({
      protocol: 'https',
      handler: webHandler
    });
  }
  return jsonLdDocLoader;
};

export {getDocumentLoader};
