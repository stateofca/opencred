/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {mdocIssuerCertificates} from
  '../../../../lib/logger/events/mdocIssuerCertificates.js';

describe('logger/events mdocIssuerCertificates', () => {
  it('builds expected payload', () => {
    const documents = [{docType: 'org.iso.18013.5.1.mDL', chainLength: 1}];
    const {logName, event} = mdocIssuerCertificates({
      clientId: 'c1',
      exchangeId: 'e1',
      profile: 'cadmv-ios',
      documents
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'mdoc_issuer_certificates',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      profile: 'cadmv-ios',
      documents
    });
  });

  it('defaults missing identifiers to unknown and omits profile', () => {
    const {event} = mdocIssuerCertificates({documents: []});
    expect(event.clientId).to.equal('unknown');
    expect(event.exchangeId).to.equal('unknown');
    expect(event).not.to.have.key('profile');
    expect(event.documents).to.eql([]);
  });
});
