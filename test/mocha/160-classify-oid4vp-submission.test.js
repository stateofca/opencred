/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {NativeWorkflowService} from '../../lib/workflows/native-workflow.js';

describe('classifyOID4VPSubmission', () => {
  let service;

  before(() => {
    service = new NativeWorkflowService();
  });

  it('should return "oid4vp-draft18" when submission is provided', () => {
    const submission = {
      id: 'test-submission',
      definition_id: 'test-definition',
      descriptor_map: []
    };
    const dcql_query = {
      credentials: [{id: 'test-cred', format: 'jwt_vc_json'}]
    };

    const result = service.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    expect(result).to.be('oid4vp-draft18');
  });

  it('should return "oid4vp-draft18" even if dcql_query exists', () => {
    const submission = {
      id: 'test-submission',
      definition_id: 'test-definition',
      descriptor_map: []
    };
    const dcql_query = {
      credentials: [{id: 'test-cred', format: 'jwt_vc_json'}]
    };

    const result = service.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    expect(result).to.be('oid4vp-draft18');
  });

  it('should return "oid4vp-1.0" when dcql_query.credentials' +
    'exists and no submission', () => {
    const submission = null;
    const dcql_query = {
      credentials: [
        {id: 'test-cred-1', format: 'jwt_vc_json'},
        {id: 'test-cred-2', format: 'ldp_vc'}
      ]
    };

    const result = service.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    expect(result).to.be('oid4vp-1.0');
  });

  it('should return "oid4vp-1.0" when dcql_query.credentials' +
    'exists and submission is undefined', () => {
    const submission = undefined;
    const dcql_query = {
      credentials: [{id: 'test-cred', format: 'jwt_vc_json'}]
    };

    const result = service.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    expect(result).to.be('oid4vp-1.0');
  });

  it('should return null when neither submission nor dcql_query.credentials' +
    'is provided', () => {
    const submission = null;
    const dcql_query = null;

    const result = service.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    expect(result).to.be(null);
  });

  it('should return null when dcql_query exists but has no credentials', () => {
    const submission = null;
    const dcql_query = {};

    const result = service.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    expect(result).to.be(null);
  });

  it('should return null when dcql_query.credentials is an empty array', () => {
    const submission = null;
    const dcql_query = {
      credentials: []
    };

    const result = service.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    expect(result).to.be(null);
  });

  it('should return null when dcql_query.credentials is not an array', () => {
    const submission = null;
    const dcql_query = {
      credentials: 'not-an-array'
    };

    const result = service.classifyOID4VPSubmission({
      submission,
      dcql_query
    });

    expect(result).to.be(null);
  });
});

