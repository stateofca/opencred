/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {auditUtils} from '../../common/audit.js';
import {BaseWorkflowService} from './base.js';
import {config} from '@bedrock/core';
import {createId} from '../../common/utils.js';
import {database} from '../database.js';
import {zcapClient} from '../../common/zcap.js';

/**
 * Workflow service for VC-API workflows.
 * This assumes a microservice that handles VC-API exchanges outside of
 * the OpenCred platform that has matching endpoitns for OID4VP.
 * It is essentially a stub for potential future work and may not work
 * with any existing VC-API system. ZCAP authentication required.
 */
export class VCApiWorkflowService extends BaseWorkflowService {
  getProtocols({exchange}) {
    return {
      ...super.getProtocols({exchange}),
      vcapi: exchange.vcapi
    };
  }

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    const {workflow, accessToken, oidc} = trustedVariables;
    const duration = config.opencred.options.recordExpiresDurationMs;
    const ttl = Math.min(Math.floor(duration / 1000), 60 * 15);

    if(workflow?.type !== 'vc-api') {
      return;
    }
    try {
      const verifiablePresentationRequest = JSON.parse(
        workflow.verifiablePresentationRequest);
      const variables = (untrustedVariables &&
          workflow.untrustedVariableAllowList) ?
        this.parseUntrustedVariables(
          workflow.untrustedVariableAllowList,
          untrustedVariables
        ) :
        {};
      const {result} = await zcapClient.zcapWriteRequest({
        endpoint: workflow.baseUrl,
        zcap: {
          capability: workflow.capability,
          clientSecret: workflow.clientSecret
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

      const vcapi = result.headers.get('location');
      const authzReqUrl = `${vcapi}/openid/client/authorization/request`;
      const searchParams = new URLSearchParams({
        client_id: `${vcapi}/openid/client/authorization/response`,
        request_uri: authzReqUrl
      });
      const OID4VP = 'openid4vp://authorize?' + searchParams.toString();

      const createdAt = new Date();
      const exchange = {
        id: await createId(),
        workflowId: workflow.clientId,
        vcapi,
        OID4VP,
        accessToken,
        ttl,
        createdAt,
        recordExpiresAt:
          new Date(createdAt.getTime() + duration),
        oidc
      };
      await database.collections.Exchanges.insertOne(exchange);
      return this.formatExchange(exchange, {workflow});
    } catch(error) {
      throw new Error(error.message);
    }
  }

  async getExchange(
    {workflow, id, accessToken, allowExpired} = {allowExpired: false}
  ) {
    if(!workflow?.type || workflow.type !== 'vc-api') {
      return super.getExchange(
        {workflow, id, accessToken, allowExpired}
      );
    }
    const exchange = await super.getExchange(
      {workflow, id, accessToken, allowExpired}
    );
    if(!exchange) {
      return null;
    }

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
        await database.collections.Exchanges.replaceOne({id: exchange.id}, {
          ...exchange,
          variables: data.variables,
          state: 'complete',
          oidc

        });
        const initialStep = data.initialStep ?? 'default';
        // Implementation may vary for how results are stored in the exchange.
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
