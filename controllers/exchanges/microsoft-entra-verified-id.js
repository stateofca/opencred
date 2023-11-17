import {config} from '../../config/config.js';
import {createId} from '../../common/utils.js';
import {exchanges} from '../../common/database.js';
import {msalUtils} from '../../common/utils.js';

// Microsoft Entra Verified ID Workflow Middleware

// Domain of values for requestStatus property in verification callback request
const VerificationStatus = {
  RequestRetrieved: 'request_retrieved',
  PresentationVerified: 'presentation_verified'
};

const createExchangeHelper = async rp => {
  const workflow = rp.workflow;
  const workflowId = workflow.id;
  const {
    apiBaseUrl,
    verifierDid,
    verifierName,
    acceptedCredentialType,
  } = workflow;

  const defaults = {
    credentialVerificationCallbackAuthEnabled: true,
    acceptedCredentialIssuers: [],
    credentialVerificationPurpose: 'To check permission to access resources',
    allowRevokedCredentials: false,
    validateLinkedDomain: true,
    includeQrCode: false
  };
  const {
    credentialVerificationCallbackAuthEnabled,
    acceptedCredentialIssuers,
    credentialVerificationPurpose,
    allowRevokedCredentials,
    validateLinkedDomain,
    includeQrCode
  } = {defaults, ...workflow};
  const domain = rp.domain;
  const accessToken = await createId();
  // NOTE: Since we do not receive the state back from
  // the immediate credential verification response,
  // we are not able to correlate it with an exchange.
  // Hence, we cannot use this and instead use requestId.
  // However, this is a required field in the API, so we must use it.
  const state = await createId();

  const verificationPayload = {
    includeQRCode: includeQrCode,
    includeReceipt: true,
    authority: verifierDid,
    registration: {
      clientName: verifierName
    },
    callback: {
      url: `${domain}/verification/callback`,
      state,
      ...(credentialVerificationCallbackAuthEnabled && {
        headers: {
          Authorization: accessToken
        }
      })
    },
    requestedCredentials: [
      {
        type: acceptedCredentialType,
        purpose: credentialVerificationPurpose,
        acceptedIssuers: acceptedCredentialIssuers,
        configuration: {
          validation: {
            allowRevoked: allowRevokedCredentials,
            validateLinkedDomain
          }
        }
      }
    ]
  };

  const msalClient = msalUtils.getMsalClient(rp);
  const {data} = await msalUtils.makeHttpPostRequest({
    msalClient,
    url: `${apiBaseUrl}/verifiableCredentials/createPresentationRequest`,
    data: verificationPayload
  });

  if(data.error) {
    const {requestId, error} = data;
    const {code: outerCode, outerMessage, innererror} = error;
    const {innerCode, innerMessage, target} = innererror;
    throw new Error(
      `Request ID - ${requestId}\n`
      `[${outerCode}] ${outerMessage}\n    ` +
      `[${innerCode}${target ? ' - ' + target : ''}] ${innerMessage}\n`
    );
  }

  const {requestId, url, expiry} = data;

  const now = Date.now();
  const ttl = Math.floor((expiry - now) / 1000);
  await exchanges.insertOne({
    id: requestId,
    workflowId,
    sequence: 0,
    ttl,
    state: 'pending',
    accessToken
  });

  const vcapi = `${domain}/workflows/${workflowId}/exchanges/${requestId}`;
  return {id: requestId, vcapi, OID4VP: url, accessToken, workflowId};
};

const createExchange = async (req, res, next) => {
  const rp = req.rp;
  if(
    !rp ||
    !rp.workflow ||
    rp.workflow.type !== 'microsoft-entra-verified-id'
  ) {
    next();
    return;
  }
  try {
    req.exchange = await createExchangeHelper(rp);
  } catch(error) {
    res.status(500).send({
      message: 'Error creating exchange:\n' + error.message
    });
    return;
  }
  next();
};

const _convertEntraVcDataToW3cVcData = entraVcData => {
  return entraVcData.map(vcData => {
    return {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        {'@vocab': 'https://schema.org'}
      ],
      type: vcData.type,
      issuer: vcData.issuer,
      issuanceDate: vcData.issuanceDate,
      expirationDate: vcData.expirationDate,
      credentialSubject: vcData.claims
    };
  });
};

const verificationCallback = async (req, res) => {
  const authHeader = req.headers.authorization;
  // NOTE: Since we do not receive the state back from
  // the immediate credential verification response,
  // we were not able to correlate it with an exchange.
  // Hence, we cannot use this and instead use requestId.
  const requestId = req.body.requestId;
  const verificationStatus = req.body.requestStatus;
  const subject = req.body.subject;
  const entraVcData = req.body.verifiedCredentialsData;
  const receipt = req.body.receipt;
  const [authType, authValue] = authHeader ?
    authHeader.split(' ') :
    [undefined, undefined];

  let exchange;
  if(authValue) {
    exchange = await exchanges.findOne(
      {id: requestId},
      {projection: {_id: 0}}
    );
  }
  const rp = config.relyingParties.find(
    r => r.workflow?.id == exchange.workflowId
  );
  if(!exchange) {
    res.status(401).send({message: 'Unauthorized to access this resource'});
    return;
  }

  if(rp.workflow.credentialVerificationCallbackAuthEnabled) {
    if(!authHeader) {
      res.status(401).send({message: 'Authorization header is required'});
      return;
    }
    if(authType !== 'Bearer' || !authValue) {
      res.status(401).send({message: 'Invalid authorization format'});
      return;
    }
    if(exchange.accessToken != authValue) {
      res.status(401).send({message: 'Invalid access token'});
      return;
    }
  }

  let exchangeState;
  switch(verificationStatus) {
    case VerificationStatus.RequestRetrieved:
      exchangeState = 'pending';
      res.status(200).send({message: 'Credential verification is pending'});
      break;
    case VerificationStatus.PresentationVerified:
      exchangeState = 'complete';
      res.status(200).send({message: 'Credential verification is complete'});
      break;
    default:
      exchangeState = 'invalid';
      res.status(400).send(
        {message: 'Unrecognized verification status'}
      );
  }

  if(receipt?.vp_token) {
    await exchanges.updateOne({
      id: requestId,
      state: exchangeState
    }, {$set: {
      'variables.results.final': {
        verifiablePresentation: receipt.vp_token
      },
      updatedAt: Date.now()
    }});
  } else if(Array.isArray(entraVcData) && entraVcData.length > 0) {
    const w3cVcData = _convertEntraVcDataToW3cVcData(entraVcData);
    await exchanges.updateOne({
      id: requestId,
      state: exchangeState
    }, {$set: {
      'variables.results.final': {
        verifiablePresentation: {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiablePresentation'],
          verifiableCredential: w3cVcData,
          holder: subject
        }
      },
      updatedAt: Date.now()
    }});
  } else {
    await exchanges.updateOne({
      id: requestId,
      state: exchangeState
    }, {$set: {
      updatedAt: Date.now()
    }});
  }
};

export default function(app) {
  app.get('/login', createExchange);

  app.post('/workflows/:workflowId/exchanges', createExchange);

  app.get('/workflows/:workflowId/exchanges/:exchangeId',
    async (req, res, next) => {
      const rp = req.rp;
      if(
        !rp ||
        !rp.workflow ||
        rp.workflow.type !== 'microsoft-entra-verified-id'
      ) {
        next();
        return;
      }
      if(!req.exchange) {
        req.exchange = await exchanges.findOne({id: req.params.exchangeId});
      }
      next();
    });

  app.post('/verification/callback', verificationCallback);
}
