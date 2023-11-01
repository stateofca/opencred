import {zcapReadRequest, zcapWriteRequest} from '../../common/zcap.js';

export default function(app) {
  app.use('/login', async (req, res, next) => {
    const rp = req.rp;
    if(!rp || !rp.workflow || rp.workflow.type !== 'vc-api') {
      next();
      return;
    }

    const workflow = rp.workflow;

    try {
      const verifiablePresentationRequest = JSON.parse(workflow.vpr);
      const {result} = await zcapWriteRequest({
        endpoint: workflow.base_url,
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

      req.exchange = {
        vcapi: exchangeId,
        OID4VP
      };
      next();
    } catch(e) {
      console.error(e);
      res.status(500).send({message: 'Internal Server Error'});
    }
  });

  app.use('/exchange', async (req, res, next) => {
    const rp = req.rp;
    if(!rp || !rp.workflow || rp.workflow.type !== 'vc-api') {
      next();
      return;
    }

    const workflow = rp.workflow;

    const {data, error} = await zcapReadRequest({
      endpoint: req.query.exchangeId,
      zcap: {
        capability: workflow.capability,
        clientSecret: workflow.clientSecret
      }
    });
    if(error) {
      res.sendStatus(404);
    } else {
      req.exchange = data;
    }
    next();
  });
}
