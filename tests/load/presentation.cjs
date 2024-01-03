const base64url = require('base64url');
const vc_jwt = require('../fixtures/vc_jwt.json');
const {createVerifiablePresentationJwt} = require('did-jwt-vc');
const didJWT = require('did-jwt');

module.exports = {
  getExchangeDetails: function(requestParams, response, context, ee, next) {
    const [, payload] = response.body.split('.');
    context.vars.request = base64url.decode(payload);
    next();
  },
  sendPresentation: async function(requestParams, context, ee, next) {
    const {
      client_metadata,
      presentation_definition
    } = JSON.parse(context.vars.request);
    if(Object.keys(client_metadata.vp_formats).some(k => k === 'jwt_vc')) {
      const vpPayload = {
        vp: {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiablePresentation'],
          verifiableCredential: [vc_jwt.valid['did:key']]
        }
      };
      const signer = didJWT.EdDSASigner(
        didJWT.base64ToBytes('PglOYdhW-hsJmbqOcNzTokIKQcm2Xvz7zQ58cDPvitw')
      );
      const issuer = {
        did: 'did:key:z6MkvW1tgFJgdejjxrjYmUbrCHfAyGXMk7FAwAo23inXgHDm',
        signer,
        alg: 'Ed25519'
      };
      context.vars.vp_token = await createVerifiablePresentationJwt(
        vpPayload, issuer
      );
      context.vars.submission = {
        id: 'submission',
        definition_id: presentation_definition.id,
        descriptor_map: presentation_definition.input_descriptors.map(i => ({
          id: i.id,
          path: '$',
          format: 'jwt_vp_json',
          path_nested: {
            format: 'jwt_vc',
            path: '$.verifiableCredential[0]',
          }
        }))
      };
    } else if(
      Object.keys(client_metadata.vp_formats).some(k => k === 'ldp_vc')
    ) {
      console.log('TODO: HANDLE DATA INTEGRITY CASE');
    } else {
      throw new Error(
        `bad vp format: ${JSON.stringify(client_metadata.vp_formats)}`
      );
    }
    next();
  },
  statePending: function(context, next) {
    const continueLooping = context.vars.state !== 'complete';
    return next(continueLooping);
  }
};
