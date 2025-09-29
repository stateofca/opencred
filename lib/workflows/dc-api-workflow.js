/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2025 Spruce Systems, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import { BaseWorkflowService } from "./base.js";
import { config } from "@bedrock/core";
import { logger } from "../logger.js";
import { createId, logUtils } from "../../common/utils.js";
import { database } from "../database.js";
import { zcapClient } from "../../common/zcap.js";
import { DcApi, JsOid4VpSessionStore } from "@spruceid/dc-api";

const WORKFLOW_TYPE = "dc-api";

const AUTHORIZATION_REQUEST_ENDPOINT =
  "/workflows/:workflowId/exchanges/:exchangeId/dc-api/request";

const AUTHORIZATION_RESPONSE_ENDPOINT =
  "/workflows/:workflowId/exchanges/:exchangeId/dc-api/response";

export class DCApiWorkflowService extends BaseWorkflowService {
  /** @type {DcApi} */
  dcApi;

  dcApiSessionCache = new Map();

  constructor(app) {
    super(app);

    app.get(
      AUTHORIZATION_REQUEST_ENDPOINT,
      this.authorizationRequest.bind(this),
    );
    app.post(
      AUTHORIZATION_RESPONSE_ENDPOINT,
      this.authorizationResponse.bind(this),
    );

    // Set the DC API Instance
    this.initDcApi().then((dcApi) => {
      this.dcApi = dcApi;
    });
  }

  async initDcApi() {
    const rp = config.opencred.relyingParties.find(
      (rp) => rp.workflow.type === "dc-api",
    );

    const sk = config.opencred.signingKeys.find((k) =>
      k.purpose?.includes("authorization_request"),
    );

    const encoder = new TextEncoder();
    const dcApiConfig = {
      key: sk.privateKeyPem,
      baseUrl: rp?.workflow?.baseUrl,
      submissionEndpoint: "",
      referenceEndpoint: "",
      certChainPem: encoder.encode(config.opencred.caStore[0]),
    };

    const submissionEndpoint = "";
    const referenceEndpoint = "";

    // const dcApi = new DcApi();
    const dcApi = await DcApi.new(
      sk.privateKeyPem,
      rp?.workflow?.baseUrl,
      submissionEndpoint,
      referenceEndpoint,
      encoder.encode(config.opencred.caStore[0]),
      JsOid4VpSessionStore.createMemoryStore(),
      // DC API Session
      {
        newSession: async (sessionId, session) => {
          this.dcApiSessionCache.set(sessionId, session);
        },
        getSession: async (id, clientSecret) => {
          const session = this.dcApiSessionCache.get(id);
          if (!session) {
            return null;
          }
          // Return the session - the DC API will validate the client_secret hash
          return session;
        },
        getSessionUnauthenticated: async (id) => {
          return this.dcApiSessionCache.get(id) || null;
        },
        updateSession: async (sessionId, session) => {
          this.dcApiSessionCache.set(sessionId, session);
        },
        removeSession: async (sessionId) => {
          this.dcApiSessionCache.delete(sessionId);
        },
      },
    );

    return dcApi;
  }

  async createWorkflowSpecificExchange(trustedVariables, untrustedVariables) {
    if (trustedVariables.rp?.workflow?.type !== WORKFLOW_TYPE) {
      return;
    }

    let dcApiSession = await this.dcApi.create_new_session();

    const ex = await this.initExchange(trustedVariables, untrustedVariables);
    if (!ex.workflowId) {
      ex.workflowId = trustedVariables.rp.workflow.id;
    }

    ex.variables = {
      dcApiSession,
    };

    await database.collections.Exchanges.insertOne(ex);

    return this.formatExchange(ex);
  }

  async authorizationRequest(req, res) {
    const rp = req.rp;
    const exchange = await this.getExchange({ rp, id: req.params.exchangeId });

    logUtils.presentationStart(rp?.clientId, exchange?.id);
    if (!exchange || exchange?.workflowId !== req.params.workflowId) {
      const errorMessage = "Exchange not found";
      logUtils.presentationError(rp?.clientId, "unknown", errorMessage);
      res.status(404).send({ message: errorMessage });
      return;
    }
    if (exchange.state !== "pending" && exchange.state !== "active") {
      const errorMessage = `Exchange in state ${exchange.state}`;
      logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
      res.status(400).send(errorMessage);
      return;
    }
    try {
      const sessionId = exchange.variables.dcApiSession.id;
      const sessionSecret = exchange.variables.dcApiSession.client_secret;

      if (!sessionSecret || !sessionId) {
        res.status(500).send({ message: "Session data missing from exchange" });
        return;
      }

      let requests = await this.dcApi.initiate_request(
        sessionId,
        sessionSecret,
        JSON.parse(rp.workflow.dcApiRequest),
        req.headers["user-agent"],
      );

      let updatedSession = this.dcApiSessionCache.get(sessionId);
      exchange.variables.dcApiSession = {
        ...exchange.variables.dcApiSession,
        ...updatedSession,
      };

      await database.collections.Exchanges.updateOne(
        { id: exchange.id },
        {
          $set: { variables: exchange.variables, state: "active" },
        },
      );

      res.send(requests);
    } catch (error) {
      logUtils.presentationError(rp?.clientId, exchange.id, error.message);
      logger.error(error.message, { error });
      res.sendStatus(500);
    }
    return;
  }

  async authorizationResponse(req, res) {
    try {
      const rp = req.rp;

      const exchange = await this.getExchange({
        rp,
        id: req.params.exchangeId,
      });

      if (!exchange || exchange?.workflowId !== req.params.workflowId) {
        const errorMessage = "Exchange not found";
        logUtils.presentationError(rp?.clientId, "unknown", errorMessage);
        res.status(404).send({ message: errorMessage });
        return;
      }

      if (exchange.state !== "active") {
        const errorMessage = `Exchange in state ${exchange.state}`;
        logUtils.presentationError(rp?.clientId, exchange.id, errorMessage);
        res.status(400).send(errorMessage);
        return;
      }

      const results = await this.dcApi.submit_response(
        exchange.variables.dcApiSession.id,
        exchange.variables.dcApiSession.client_secret,
        req.body,
      );

      // Generate OIDC authorization code for Keycloak/OAuth flows
      const oidcCode = await createId();

      await database.collections.Exchanges.updateOne(
        { id: exchange.id },
        {
          $set: {
            state: "complete",
            step: "verification",
            "oidc.code": oidcCode,
            variables: {
              ...exchange.variables,
              dcApiResponse: results,
              results: {
                verification: results,
              },
            },
          },
        },
      );

      // Send callback to relying party if configured
      if (rp.workflow.callback) {
        const { sendCallback } = await import("../callback.js");
        const callbackSuccess = await sendCallback(
          rp.workflow,
          {
            ...exchange,
            variables: { ...exchange.variables, dcApiResponse: results },
          },
          "verification",
        );
        if (!callbackSuccess) {
          logger.warn("Failed to send callback to relying party");
        }
      }

      // Get the updated exchange to return to frontend with OIDC code
      const updatedExchange = await database.collections.Exchanges.findOne({
        id: exchange.id,
      });

      // Return both results and updated exchange with OIDC code
      res.send({
        ...results,
        exchange: {
          id: updatedExchange.id,
          oidc: updatedExchange.oidc,
          state: updatedExchange.state,
        },
      });
    } catch (error) {
      logUtils.presentationError(rp?.clientId, exchange.id, error.message);
      logger.error(error.message, { error });
      res.sendStatus(500);
    }
  }
}
