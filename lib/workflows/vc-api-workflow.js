/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {auditUtils} from '../../common/audit.js';
import {BaseWorkflowService} from './base.js';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {zcapClient} from '../../common/zcap.js';

export class VCApiWorkflowService extends BaseWorkflowService {
  getProtocols(exchange, {rp} = {}) {
    if(!exchange || !rp || rp.type !== 'vc-api') {
      return {};
    }
    const domain = config.server.baseUri;
    const {id, workflowId} = exchange;
    return {
      vcapi: `${domain}/workflows/${workflowId}/exchanges/${id}`
    };
  }

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    const {rp, accessToken, oidc} = trustedVariables;
    const duration = config.opencred.options.recordExpiresDurationMs;
    const ttl = Math.min(Math.floor(duration / 1000), 60 * 15);

    if(rp?.type !== 'vc-api') {
      return;
    }
    try {
      const verifiablePresentationRequest = JSON.parse(
        rp.verifiablePresentationRequest);
      const variables = (untrustedVariables && rp.untrustedVariableAllowList) ?
        this.parseUntrustedVariables(
          rp.untrustedVariableAllowList,
          untrustedVariables
        ) :
        {};
      const {result} = await zcapClient.zcapWriteRequest({
        endpoint: rp.baseUrl,
        zcap: {
          capability: rp.capability,
          clientSecret: rp.clientSecret
        },
        json: {
          ttl,
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
      const exchange = {
        id: encodeURIComponent(exchangeId),
        workflowId: rp.clientId,
        vcapi: exchangeId,
        OID4VP,
        accessToken,
        ttl,
        createdAt,
        recordExpiresAt:
          new Date(createdAt.getTime() + duration),
        oidc
      };
      await database.collections.Exchanges.insertOne(exchange);
      return this.formatExchange(exchange, {rp});
    } catch(error) {
      throw new Error(error.message);
    }
  }

  async getExchange(
    {rp, id, accessToken, allowExpired} = {allowExpired: false}
  ) {
    if(!rp?.type || rp.type !== 'vc-api') {
      return super.getExchange(
        {rp, id, accessToken, allowExpired}
      );
    }
    const exchange = await super.getExchange(
      {rp, id, accessToken, allowExpired}
    );
    if(!exchange) {
      return null;
    }

    const {data, error} = await zcapClient.zcapReadRequest({
      endpoint: decodeURIComponent(exchange.vcapi),
      zcap: {
        capability: rp.capability,
        clientSecret: rp.clientSecret
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
        await database.collections.Exchanges.replaceOne({id: exchange.id}, {
          ...exchange,
          variables: data.variables,
          state: 'complete',
          oidc,

        });
        const initialStep = data.initialStep ?? 'default';
        // Implmentation may vary for how results are stored in the exchange.
        if(
          config.opencred.audit.enable &&
          data.variables?.[initialStep]?.results?.verifiablePresentation) {
          await auditUtils.updateIssuerDidDocumentHistory(
            data.variables[initialStep].results.verifiablePresentation
          );
        }
      }

      return {
        ...data,
        oidc
      };
    }
  }
}
