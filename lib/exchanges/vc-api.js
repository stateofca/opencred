/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {logger} from '../logger.js';
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
    const params = {...req.query, ...req.body};
    const variables = {};
    for(const v of Object.keys(params)) {
      if(workflow.params.indexOf(v) >= 0) {
        variables[v] = params[v];
      }
    }
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
          openId: {createAuthorizationRequest: 'authorizationRequest'},
          ...variables
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
      recordExpiresAt: new Date(createdAt.getTime() + 86400000 + (ttl * 1000)),
      oidc: {
        code: null,
        state: req.query?.state ?? req.body?.oidcState
      }
    };
    await database.collections.Exchanges.insertOne(req.exchange);
    next();
  } catch(error) {
    logger.error(error.message, {error});
    res.status(500).send({message: 'Internal Server Error'});
  }
};

export default function(app) {
  app.get('/context/login', createVcApiExchange);
  app.get('/context/verification', createVcApiExchange);

  app.post('/workflows/:workflowId/exchanges', createVcApiExchange);

  app.get(
    '/workflows/:workflowId/exchanges/:exchangeId',
    async (req, res, next) => {
      const rp = req.rp;
      if(!rp || !rp.workflow || rp.workflow.type !== 'vc-api') {
        next();
        return;
      }
      const exchange = await database.collections.Exchanges.findOne({
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
        const oidc = {
          code: await createId(),
          state: exchange.oidc?.state
        };
        if(data.state === 'complete' && !exchange.oidc?.code) {
          await database.collections.Exchanges.updateOne({id: exchange.id}, {
            $set: {oidc}
          });
        }

        req.exchange = {
          ...data,
          oidc
        };
      }
      next();
    });
}
