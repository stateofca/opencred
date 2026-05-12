/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  findWorkflow,
  findWorkflowByCredentials
} from '../../lib/resolveClient.js';

const workflows = [
  {clientId: 'alpha', clientSecret: 'secret-a'},
  {clientId: 'beta', clientSecret: 'secret-b', workflowId: 'legacy-beta'},
  {clientId: 'gamma', clientSecret: 'secret-g'}
];

describe('findWorkflow', function() {
  it('should find workflow by clientId', function() {
    const result = findWorkflow(workflows, 'alpha');
    expect(result).to.be.ok();
    expect(result.clientId).to.equal('alpha');
  });

  it('should find workflow by workflowId fallback', function() {
    const result = findWorkflow(workflows, 'legacy-beta');
    expect(result).to.be.ok();
    expect(result.clientId).to.equal('beta');
  });

  it('should prefer clientId over workflowId', function() {
    const wfs = [
      {clientId: 'shared-id', clientSecret: 's1'},
      {clientId: 'other', clientSecret: 's2', workflowId: 'shared-id'}
    ];
    const result = findWorkflow(wfs, 'shared-id');
    expect(result.clientId).to.equal('shared-id');
  });

  it('should return undefined for unknown identifier', function() {
    const result = findWorkflow(workflows, 'nonexistent');
    expect(result).to.be(undefined);
  });

  it('should return undefined for empty workflows array', function() {
    const result = findWorkflow([], 'alpha');
    expect(result).to.be(undefined);
  });
});

describe('findWorkflowByCredentials', function() {
  it('should find workflow by clientId + secret', function() {
    const result = findWorkflowByCredentials(
      workflows, 'alpha', 'secret-a'
    );
    expect(result).to.be.ok();
    expect(result.clientId).to.equal('alpha');
  });

  it('should find workflow by workflowId + secret', function() {
    const result = findWorkflowByCredentials(
      workflows, 'legacy-beta', 'secret-b'
    );
    expect(result).to.be.ok();
    expect(result.clientId).to.equal('beta');
  });

  it('should reject wrong secret for clientId', function() {
    const result = findWorkflowByCredentials(
      workflows, 'alpha', 'wrong-secret'
    );
    expect(result).to.be(undefined);
  });

  it('should reject wrong secret for workflowId', function() {
    const result = findWorkflowByCredentials(
      workflows, 'legacy-beta', 'wrong-secret'
    );
    expect(result).to.be(undefined);
  });

  it('should prefer clientId match over workflowId match', function() {
    const wfs = [
      {clientId: 'shared-id', clientSecret: 'sec-1'},
      {clientId: 'other', clientSecret: 'sec-2', workflowId: 'shared-id'}
    ];
    const result = findWorkflowByCredentials(wfs, 'shared-id', 'sec-1');
    expect(result.clientId).to.equal('shared-id');
  });
});
