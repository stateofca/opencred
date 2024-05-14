import * as bedrock from '@bedrock/core';
const {config} = bedrock;

const getOAuthConfigs = workflow => {
  const configs = [];
  for(const step of Object.keys(workflow.steps ?? {})) {
    const {oauth} = workflow.steps[step].callback ?? {};
    if(oauth) {
      configs.push({
        issuer: oauth.issuer,
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        token_endpoint: oauth.tokenUrl,
        scope: oauth.scope,
        pkce: false,
        protocol: 'oauth2_client_grant',
        grant_type: 'client_credentials'
      });
    }
  }
  return configs;
};

config.opencred.authorization = config.opencred.relyingParties.flatMap(
  rp => getOAuthConfigs(rp.workflow)
).filter(c => c);
