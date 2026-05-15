/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  getWorkflowRequestJson,
  omitWorkflowTranslations,
  summarizeInteractionState,
  summarizePickerEntries,
  summarizeWorkflow
} from '../../../web/utils/debug-info.js';

const WORKFLOW = {
  clientId: 'test-client',
  name: 'Test Workflow',
  type: 'native',
  dcApiEnabled: true,
  configFrom: 'base',
  interactEnabled: false,
  public: true,
  description: 'A test workflow',
  brand: {
    primary: '#045199',
    header: '#0979c4',
    homeLink: 'https://example.com'
  },
  redirectUri: 'https://example.com/callback',
  query: [{fields: {'org.iso.18013.5.1': ['given_name']}}],
  translations: {
    en: {greeting: 'Hello'},
    fr: {greeting: 'Bonjour'}
  }
};

describe('debug-info', () => {
  describe('omitWorkflowTranslations', () => {
    it('should remove translations from workflow',
      () => {
        const result = omitWorkflowTranslations({
          workflow: WORKFLOW
        });
        expect(result.translations).to.be(undefined);
        expect(result.clientId).to.be('test-client');
      });

    it('should not mutate the original workflow',
      () => {
        const original = {...WORKFLOW};
        omitWorkflowTranslations({
          workflow: original
        });
        expect(original.translations).to.be.ok();
        expect(original.translations.en.greeting)
          .to.be('Hello');
      });

    it('should preserve all other fields', () => {
      const result = omitWorkflowTranslations({
        workflow: WORKFLOW
      });
      expect(result.name).to.be('Test Workflow');
      expect(result.type).to.be('native');
      expect(result.query).to.be.ok();
      expect(result.brand).to.be.ok();
    });

    it('should return empty object for null input',
      () => {
        const result = omitWorkflowTranslations({
          workflow: null
        });
        expect(Object.keys(result).length).to.be(0);
      });

    it('should return empty object for no args',
      () => {
        const result = omitWorkflowTranslations();
        expect(Object.keys(result).length).to.be(0);
      });
  });

  describe('getWorkflowRequestJson', () => {
    it('should extract query field when present',
      () => {
        const result = getWorkflowRequestJson({
          workflow: WORKFLOW
        });
        expect(result.query).to.be.ok();
        expect(result.query).to.eql(WORKFLOW.query);
      });

    it('should extract multiple request fields',
      () => {
        const wf = {
          ...WORKFLOW,
          dcql_query: {credentials: []},
          vpr: {query: {type: 'QueryByExample'}}
        };
        const result = getWorkflowRequestJson({
          workflow: wf
        });
        expect(result.query).to.be.ok();
        expect(result.dcql_query).to.be.ok();
        expect(result.vpr).to.be.ok();
      });

    it('should not include absent fields', () => {
      const wf = {clientId: 'x', name: 'y'};
      const result = getWorkflowRequestJson({
        workflow: wf
      });
      expect(Object.keys(result).length).to.be(0);
    });

    it('should return empty object for null input',
      () => {
        const result = getWorkflowRequestJson({
          workflow: null
        });
        expect(Object.keys(result).length).to.be(0);
      });

    it('should preserve full request field values',
      () => {
        const deepQuery = [{
          fields: {
            'org.iso.18013.5.1': [
              'family_name', 'given_name'
            ]
          },
          format: ['mso_mdoc']
        }];
        const wf = {query: deepQuery};
        const result = getWorkflowRequestJson({
          workflow: wf
        });
        expect(result.query).to.eql(deepQuery);
      });
  });

  describe('summarizeWorkflow', () => {
    it('should include scalar fields', () => {
      const rows = summarizeWorkflow({
        workflow: WORKFLOW
      });
      const labels = rows.map(r => r.label);
      expect(labels).to.contain('clientId');
      expect(labels).to.contain('name');
      expect(labels).to.contain('type');
      expect(labels).to.contain('dcApiEnabled');
    });

    it('should include brand hints', () => {
      const rows = summarizeWorkflow({
        workflow: WORKFLOW
      });
      const labels = rows.map(r => r.label);
      expect(labels).to.contain('brand.homeLink');
      expect(labels).to.contain('brand.primary');
      expect(labels).to.contain('brand.header');
    });

    it('should include redirectUri when present',
      () => {
        const rows = summarizeWorkflow({
          workflow: WORKFLOW
        });
        const labels = rows.map(r => r.label);
        expect(labels).to.contain('redirectUri');
      });

    it('should exclude translations', () => {
      const rows = summarizeWorkflow({
        workflow: WORKFLOW
      });
      const labels = rows.map(r => r.label);
      expect(labels).not.to.contain('translations');
    });

    it('should exclude query payloads', () => {
      const rows = summarizeWorkflow({
        workflow: WORKFLOW
      });
      const labels = rows.map(r => r.label);
      expect(labels).not.to.contain('query');
    });

    it('should return empty array for null input',
      () => {
        const rows = summarizeWorkflow({
          workflow: null
        });
        expect(rows.length).to.be(0);
      });

    it('should only include fields that exist',
      () => {
        const wf = {clientId: 'x', type: 'native'};
        const rows = summarizeWorkflow({workflow: wf});
        const labels = rows.map(r => r.label);
        expect(labels).to.contain('clientId');
        expect(labels).to.contain('type');
        expect(labels).not.to.contain('name');
        expect(labels).not.to.contain('brand.homeLink');
      });
  });

  describe('summarizePickerEntries', () => {
    const ENTRIES = [
      {
        method: 'dcapi',
        profile: null,
        walletIds: ['wallet-a', 'wallet-b']
      },
      {
        method: 'qr-and-link',
        profile: 'OID4VP',
        walletIds: ['wallet-c']
      }
    ];

    it('should produce one row per entry', () => {
      const rows = summarizePickerEntries({
        pickerEntries: ENTRIES
      });
      expect(rows.length).to.be(2);
    });

    it('should use method as label', () => {
      const rows = summarizePickerEntries({
        pickerEntries: ENTRIES
      });
      expect(rows[0].label).to.be('dcapi');
      expect(rows[1].label).to.be('qr-and-link');
    });

    it('should include method and profile in values',
      () => {
        const rows = summarizePickerEntries({
          pickerEntries: ENTRIES
        });
        expect(rows[0].values.method).to.be('dcapi');
        expect(rows[1].values.profile)
          .to.be('OID4VP');
      });

    it('should include walletIds in values', () => {
      const rows = summarizePickerEntries({
        pickerEntries: ENTRIES
      });
      expect(rows[0].values.walletIds).to.eql(
        ['wallet-a', 'wallet-b']
      );
    });

    it('should prefer name over method for label',
      () => {
        const entries = [{
          method: 'chapi',
          name: 'My Wallet'
        }];
        const rows = summarizePickerEntries({
          pickerEntries: entries
        });
        expect(rows[0].label).to.be('My Wallet');
      });

    it('should return empty array for non-array',
      () => {
        const rows = summarizePickerEntries({
          pickerEntries: null
        });
        expect(rows.length).to.be(0);
      });

    it('should return empty array for no args',
      () => {
        const rows = summarizePickerEntries();
        expect(rows.length).to.be(0);
      });
  });

  describe('summarizeInteractionState', () => {
    it('should include scalar flags', () => {
      const state = {
        dcApiError: null,
        activeOverride: false,
        activePickerEntryOverride: null
      };
      const rows = summarizeInteractionState({
        interactionState: state
      });
      const labels = rows.map(r => r.label);
      expect(labels).to.contain('dcApiError');
      expect(labels).to.contain('activeOverride');
      expect(labels)
        .to.contain('activePickerEntryOverride');
    });

    it('should show boolean for override presence',
      () => {
        const state = {
          dcApiError: null,
          activeOverride: true,
          activePickerEntryOverride: {method: 'dcapi'}
        };
        const rows = summarizeInteractionState({
          interactionState: state
        });
        const overrideRow = rows.find(
          r => r.label === 'activePickerEntryOverride'
        );
        expect(overrideRow.value).to.be(true);
      });

    it('should show false when override is null',
      () => {
        const state = {
          dcApiError: null,
          activeOverride: false,
          activePickerEntryOverride: null
        };
        const rows = summarizeInteractionState({
          interactionState: state
        });
        const overrideRow = rows.find(
          r => r.label === 'activePickerEntryOverride'
        );
        expect(overrideRow.value).to.be(false);
      });

    it('should return empty array for null input',
      () => {
        const rows = summarizeInteractionState({
          interactionState: null
        });
        expect(rows.length).to.be(0);
      });

    it('should return empty array for no args',
      () => {
        const rows = summarizeInteractionState();
        expect(rows.length).to.be(0);
      });
  });
});
