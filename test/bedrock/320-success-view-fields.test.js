/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseWorkflowSchema} from '../../configs/config-utils.js';
import expect from 'expect.js';
import {resolveSuccessViewFields} from '../../lib/workflows/common.js';

const baseWorkflow = {clientId: 'svf-test', clientSecret: 'secret'};

describe('successViewFields - schema', function() {
  it('defaults to an empty array when unset', function() {
    const parsed = BaseWorkflowSchema.parse({...baseWorkflow});
    expect(parsed.successViewFields).to.eql([]);
  });

  it('accepts an entry with a literal label only', function() {
    const parsed = BaseWorkflowSchema.parse({
      ...baseWorkflow,
      successViewFields: [
        {path: '$.callbackResponse.message', label: 'Status'}
      ]
    });
    expect(parsed.successViewFields).to.have.length(1);
    expect(parsed.successViewFields[0].label).to.be('Status');
  });

  it('accepts an entry with a labelKey only', function() {
    const parsed = BaseWorkflowSchema.parse({
      ...baseWorkflow,
      successViewFields: [
        {path: '$.callbackResponse.zone.name', labelKey: 'successField_zone'}
      ]
    });
    expect(parsed.successViewFields[0].labelKey).to.be('successField_zone');
  });

  it('accepts an entry with both label and labelKey', function() {
    const parsed = BaseWorkflowSchema.parse({
      ...baseWorkflow,
      successViewFields: [{path: '$.a', label: 'A', labelKey: 'k_a'}]
    });
    expect(parsed.successViewFields[0].label).to.be('A');
    expect(parsed.successViewFields[0].labelKey).to.be('k_a');
  });

  it('rejects an entry with neither label nor labelKey', function() {
    expect(() => BaseWorkflowSchema.parse({
      ...baseWorkflow,
      successViewFields: [{path: '$.a'}]
    })).to.throwError();
  });
});

describe('resolveSuccessViewFields', function() {
  const workflow = {
    successViewFields: [
      {path: '$.callbackResponse.message', label: 'Status'},
      {path: '$.callbackResponse.zone.name', labelKey: 'successField_zone'},
      {path: '$.callbackResponse.missing', label: 'Missing'}
    ]
  };
  const exchange = {
    variables: {
      callbackResponse: {
        message: 'Parking verified',
        zone: {name: 'Lot 19'}
      }
    }
  };

  it('resolves present paths and passes through label/labelKey', function() {
    const rows = resolveSuccessViewFields({workflow, exchange});
    expect(rows).to.eql([
      {value: 'Parking verified', label: 'Status'},
      {value: 'Lot 19', labelKey: 'successField_zone'}
    ]);
  });

  it('skips paths that do not resolve (present-only)', function() {
    const rows = resolveSuccessViewFields({workflow, exchange});
    expect(rows.find(r => r.label === 'Missing')).to.be(undefined);
  });

  it('returns [] when unconfigured', function() {
    expect(resolveSuccessViewFields({workflow: {}, exchange})).to.eql([]);
    expect(resolveSuccessViewFields({
      workflow: {successViewFields: []}, exchange
    })).to.eql([]);
  });

  it('supports bare dot paths (no leading $)', function() {
    const rows = resolveSuccessViewFields({
      workflow: {
        successViewFields: [{path: 'callbackResponse.message', label: 'S'}]
      },
      exchange
    });
    expect(rows).to.eql([{value: 'Parking verified', label: 'S'}]);
  });

  it('honors scrubbing: a path into scrubbed results yields nothing',
    function() {
      const scrubbedExchange = {variables: {results: {default: {}}}};
      const wf = {
        successViewFields: [{
          path: '$.results.default.verifiablePresentation', label: 'VP'
        }]
      };
      expect(resolveSuccessViewFields({
        workflow: wf, exchange: scrubbedExchange
      })).to.eql([]);
    });
});

describe('resolveSuccessViewFields - DC API response contract', function() {
  // In the DC API flow the browser consumes the authorization-response body
  // directly and never re-fetches the exchange, so
  // authorizationResponseMiddleware embeds
  // resolveSuccessViewFields({workflow, exchange: updatedExchange}) in
  // exchange.successViewFields. `updatedExchange` is the post-processCallback
  // exchange, which carries variables.callbackResponse.
  const workflow = {
    successViewFields: [
      {path: '$.callbackResponse.radicalInfo', label: 'Radical info'}
    ]
  };

  it('resolves rows from the stored callbackResponse for the response payload',
    function() {
      const updatedExchange = {
        id: 'ex-1',
        state: 'complete',
        variables: {
          profile: 'cadmv-ios',
          results: {default: {}},
          callbackResponse: {radicalInfo: 'somestring'}
        }
      };
      const successViewFields = resolveSuccessViewFields({
        workflow, exchange: updatedExchange
      });
      expect(successViewFields).to.eql([
        {value: 'somestring', label: 'Radical info'}
      ]);
    });

  it('is an empty array when the callback stored no matching field',
    function() {
      const updatedExchange = {
        id: 'ex-2',
        state: 'complete',
        variables: {results: {default: {}}}
      };
      expect(resolveSuccessViewFields({
        workflow, exchange: updatedExchange
      })).to.eql([]);
    });
});
