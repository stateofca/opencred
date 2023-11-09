import {createId} from '../../common/utils.js';
import {exchanges} from '../../common/database.js';
import {zcapClient} from '../../common/zcap.js';

const createVcApiExchange = async (req, res, next) => {
  const rp = req.rp;
  if(!rp || !rp.workflow || rp.workflow.type !== 'vc-api') {
    next();
    return;
  }

  const workflow = rp.workflow;

  try {
    const verifiablePresentationRequest = JSON.parse(workflow.vpr);
    const {result} = await zcapClient.zcapWriteRequest({
      endpoint: workflow.baseUrl,
      zcap: {
        capability: workflow.capability,
        clientSecret: workflow.clientSecret
      },
      json: {
        ttl: 60 * 15,
        variables: {
          verifiablePresentationRequest,
          openId: {createAuthorizationRequest: 'authorizationRequest'}
        }
      }
    });
    if(!result) {
      res.status(500).send({
        message: 'Error initiating exchange: check workflow configuration.'
      });
      return;
    } else if(result.status !== 204) {
      res.status(500).send({
        message: 'Error initiating exchange'
      });
      return;
    }

    const exchangeId = result.headers.get('location');
    const authzReqUrl = `${exchangeId}/openid/client/authorization/request`;
    const searchParams = new URLSearchParams({
      client_id: `${exchangeId}/openid/client/authorization/response`,
      request_uri: authzReqUrl
    });
    const OID4VP = 'openid4vp://authorize?' + searchParams.toString();

    const createdAt = new Date();
    const ttl = 60 * 15;
    req.exchange = {
      id: encodeURIComponent(exchangeId),
      workflowId: workflow.id,
      vcapi: exchangeId,
      OID4VP,
      accessToken: await createId(),
      ttl,
      createdAt,
      recordExpiresAt: new Date(createdAt.getTime() + 86400000 + (ttl * 1000))
    };
    await exchanges.insertOne(req.exchange);
    next();
  } catch(e) {
    console.error(e);
    res.status(500).send({message: 'Internal Server Error'});
  }
};

export default function(app) {
  app.get('/login', createVcApiExchange);
  app.post('/workflows/:workflowId/exchanges', createVcApiExchange);

  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId',
    async (req, res, next) => {
      const rp = req.rp;
      if(!rp || !rp.workflow || rp.workflow.type !== 'vc-api') {
        next();
        return;
      }
      const exchange = await exchanges.findOne({
        id: encodeURIComponent(req.params.exchangeId)
      });
      if(!exchange) {
        res.sendStatus(404);
        return;
      }

      const workflow = rp.workflow;

      const {data, error} = await zcapClient.zcapReadRequest({
        endpoint: decodeURIComponent(exchange.vcapi),
        zcap: {
          capability: workflow.capability,
          clientSecret: workflow.clientSecret
        }
      });
      if(error) {
        res.sendStatus(404);
        return;
      } else {
        req.exchange = data;
      }
      next();
    });
}
