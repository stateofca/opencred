/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import {createId} from '../../common/utils.js';
import {
  createSessionStores
} from '../../lib/workflows/profiles/native-spruceid-18013-7.js';
import expect from 'expect.js';

describe('Session Stores', () => {
  let exchange;

  beforeEach(async () => {
    exchange = {
      id: await createId(),
      workflowId: 'test-workflow',
      state: 'pending',
      variables: {}
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('createSessionStores', () => {
    it('should create both session stores with shared exchange and dirty flag',
      () => {
        const stores = createSessionStores({exchange});

        expect(stores).to.have.property('oid4vpSessionStore');
        expect(stores).to.have.property('oid4vpSessionStoreImpl');
        expect(stores).to.have.property('dcapiSessionStore');
        expect(stores).to.have.property('dirty');
        expect(stores).to.have.property('updatedExchange');

        // Both stores should reference the same exchange object
        expect(stores.updatedExchange).to.be.an('object');
        expect(stores.dirty).to.be(false);
      });

    it('should deep clone exchange to avoid mutating original', () => {
      const stores = createSessionStores({exchange});

      stores.updatedExchange.variables.test = 'modified';

      expect(exchange.variables.test).to.be(undefined);
      expect(stores.updatedExchange.variables.test).to.be('modified');
    });

    it('should initialize variables object if missing', () => {
      delete exchange.variables;
      const stores = createSessionStores({exchange});

      expect(stores.updatedExchange.variables).to.be.an('object');
    });
  });

  describe('OID4VP Session Store', () => {
    it('should store session and mark dirty on initiate', async () => {
      const stores = createSessionStores({exchange});
      const session = {
        id: exchange.id,
        uuid: exchange.id,
        status: 'pending'
      };

      await stores.oid4vpSessionStoreImpl.initiate(session);

      expect(stores.dirty).to.be(true);
      expect(stores.updatedExchange.variables.oid4vpSession).to.eql(session);
    });

    it('should update status and mark dirty', async () => {
      const stores = createSessionStores({exchange});
      const session = {
        id: exchange.id,
        uuid: exchange.id,
        status: 'pending'
      };

      await stores.oid4vpSessionStoreImpl.initiate(session);
      // dirty should be true after initiate
      expect(stores.dirty).to.be(true);

      const newStatus = {type: 'SentRequest'};
      await stores.oid4vpSessionStoreImpl.updateStatus(exchange.id, newStatus);

      expect(stores.dirty).to.be(true);
      expect(stores.updatedExchange.variables.oid4vpSession.status)
        .to.eql(newStatus);
    });

    it('should return session from memory on getSession', async () => {
      const stores = createSessionStores({exchange});
      const session = {
        id: exchange.id,
        uuid: exchange.id,
        status: 'pending'
      };

      await stores.oid4vpSessionStoreImpl.initiate(session);

      const retrieved = await stores.oid4vpSessionStoreImpl.getSession(
        exchange.id
      );

      expect(retrieved).to.eql(session);
    });

    it('should throw error if session not found', async () => {
      const stores = createSessionStores({exchange});

      try {
        await stores.oid4vpSessionStoreImpl.getSession('non-existent-id');
        expect.fail('Should have thrown error');
      } catch(e) {
        expect(e.message).to.contain('OID4VP Session not found');
      }
    });

    it('should remove session and mark dirty', async () => {
      const stores = createSessionStores({exchange});
      const session = {
        id: exchange.id,
        uuid: exchange.id,
        status: 'pending'
      };

      await stores.oid4vpSessionStoreImpl.initiate(session);
      // dirty should be true after initiate
      expect(stores.dirty).to.be(true);

      await stores.oid4vpSessionStoreImpl.removeSession(exchange.id);

      expect(stores.dirty).to.be(true);
      expect(stores.updatedExchange.variables.oid4vpSession)
        .to.be(undefined);
    });
  });

  describe('DC API Session Store', () => {
    it('should store session and mark dirty on newSession', async () => {
      const stores = createSessionStores({exchange});
      const sessionId = 'test-session-id';
      const session = {
        client_secret_hash: 'hash',
        state: 'Created'
      };

      await stores.dcapiSessionStore.newSession(sessionId, session);

      expect(stores.dirty).to.be(true);
      expect(stores.updatedExchange.variables.dcApiSession.session)
        .to.eql(session);
      expect(stores.updatedExchange.variables.dcApiSession
        .session_creation_response.id).to.be(sessionId);
    });

    it('should return session from memory on getSession', async () => {
      const stores = createSessionStores({exchange});
      const sessionId = 'test-session-id';
      const session = {
        client_secret_hash: 'hash',
        state: 'Created'
      };

      await stores.dcapiSessionStore.newSession(sessionId, session);

      const retrieved = await stores.dcapiSessionStore.getSession(sessionId);

      expect(retrieved).to.eql(session);
    });

    it('should return null if session not found on getSession', async () => {
      const stores = createSessionStores({exchange});

      const retrieved = await stores.dcapiSessionStore.getSession(
        'non-existent-id'
      );

      expect(retrieved).to.be(null);
    });

    it('should return session from memory on getSessionUnauthenticated',
      async () => {
        const stores = createSessionStores({exchange});
        const sessionId = 'test-session-id';
        const session = {
          client_secret_hash: 'hash',
          state: 'Created'
        };

        await stores.dcapiSessionStore.newSession(sessionId, session);

        const retrieved =
          await stores.dcapiSessionStore.getSessionUnauthenticated(sessionId);

        expect(retrieved).to.eql(session);
      });

    it('should update session and mark dirty', async () => {
      const stores = createSessionStores({exchange});
      const sessionId = 'test-session-id';
      const session = {
        client_secret_hash: 'hash',
        state: 'Created'
      };

      await stores.dcapiSessionStore.newSession(sessionId, session);
      // dirty should be true after newSession
      expect(stores.dirty).to.be(true);

      const updatedSession = {
        client_secret_hash: 'hash',
        state: 'Initiated'
      };
      await stores.dcapiSessionStore.updateSession(sessionId, updatedSession);

      expect(stores.dirty).to.be(true);
      expect(stores.updatedExchange.variables.dcApiSession.session)
        .to.eql(updatedSession);
    });

    it('should remove session and mark dirty', async () => {
      const stores = createSessionStores({exchange});
      const sessionId = 'test-session-id';
      const session = {
        client_secret_hash: 'hash',
        state: 'Created'
      };

      await stores.dcapiSessionStore.newSession(sessionId, session);
      // dirty should be true after newSession
      expect(stores.dirty).to.be(true);

      await stores.dcapiSessionStore.removeSession(sessionId);

      expect(stores.dirty).to.be(true);
      expect(stores.updatedExchange.variables.dcApiSession)
        .to.be(undefined);
    });
  });

  describe('Shared State', () => {
    it('updatedExchange reflects changes from both stores', async () => {
      const stores = createSessionStores({exchange});

      // Update via OID4VP store
      const oid4vpSession = {
        id: exchange.id,
        uuid: exchange.id,
        status: 'pending'
      };
      await stores.oid4vpSessionStoreImpl.initiate(oid4vpSession);

      // Update via DC API store
      const sessionId = 'test-session-id';
      const dcApiSession = {
        client_secret_hash: 'hash',
        state: 'Created'
      };
      await stores.dcapiSessionStore.newSession(sessionId, dcApiSession);

      // Both should be in updatedExchange
      expect(stores.updatedExchange.variables.oid4vpSession)
        .to.eql(oid4vpSession);
      expect(stores.updatedExchange.variables.dcApiSession.session)
        .to.eql(dcApiSession);
      expect(stores.dirty).to.be(true);
    });

    it('should allow external access to dirty flag', () => {
      const stores = createSessionStores({exchange});

      expect(stores.dirty).to.be(false);

      // Modify via getter
      stores.updatedExchange.variables.test = 'value';
      // Note: dirty flag is not automatically set by external modifications
      // It's only set by store methods

      expect(stores.dirty).to.be(false);
    });
  });
});

