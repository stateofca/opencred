import * as bedrock from '@bedrock/core';
const {config} = bedrock;
const c = bedrock.util.config.main;
const cc = c.computer();

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

cc('opencred.authorization', () => config.opencred.relyingParties.flatMap(
  rp => getOAuthConfigs(rp.workflow)
).filter(c => c));
