/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseWorkflowService} from './base.js';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {zcapClient} from '../../common/zcap.js';

export class VCApiWorkflowService extends BaseWorkflowService {
  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    const {rp, accessToken, oidc} = trustedVariables;
    if(rp?.workflow?.type !== 'vc-api') {
      return;
    }
    const workflow = rp.workflow;
    try {
      const verifiablePresentationRequest = JSON.parse(workflow.vpr);
      let variables = {};
      variables = this.parseUntrustedVariables(
        rp.workflow.untrustedVariableAllowList,
        untrustedVariables
      );
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
      if(!result || result.status !== 204) {
        throw new Error('Error initiating exchange: check workflow ' +
          'configuration.');
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
      const exchange = {
        id: encodeURIComponent(exchangeId),
        workflowId: workflow.id,
        vcapi: exchangeId,
        OID4VP,
        accessToken,
        ttl,
        createdAt,
        recordExpiresAt:
          new Date(createdAt.getTime() + 86400000 + (ttl * 1000)),
        oidc
      };
      await database.collections.Exchanges.insertOne(exchange);
      return exchange;
    } catch(error) {
      throw new Error(error.message);
    }
  }

  async getExchange(
    {rp, id, accessToken, allowExpired} = {allowExpired: false}
  ) {
    const exchange = await super.getExchange(
      {rp, id, accessToken, allowExpired}
    );
    if(!exchange) {
      return null;
    }
    const workflow = rp.workflow;

    const {data, error} = await zcapClient.zcapReadRequest({
      endpoint: decodeURIComponent(exchange.vcapi),
      zcap: {
        capability: workflow.capability,
        clientSecret: workflow.clientSecret
      }
    });
    if(error || !data) {
      return null;
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

      return {
        ...data,
        oidc
      };
    }
  }
}
