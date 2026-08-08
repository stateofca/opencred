/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  nextPickerEntry, switchLinkDestinationLabel
} from '../../../web/utils/switch-link.js';

// A translator that resolves only the keys it is given, returning the key
// unchanged otherwise — the same "unresolved key comes back verbatim" contract
// vue-i18n's `t` has, which the label resolution relies on.
const makeT = (dict = {}) => key => (key in dict ? dict[key] : key);

describe('switch-link nextPickerEntry', () => {
  const a = {method: 'dcapi', profile: null};
  const b = {method: 'qr-and-link', profile: 'OID4VP-1.0'};
  const c = {method: 'chapi', profile: 'chapi'};

  it('returns null with fewer than two entries', () => {
    expect(nextPickerEntry([], a)).to.be(null);
    expect(nextPickerEntry([a], a)).to.be(null);
    expect(nextPickerEntry(undefined, a)).to.be(null);
  });

  it('advances to the next entry', () => {
    expect(nextPickerEntry([a, b, c], a)).to.be(b);
    expect(nextPickerEntry([a, b, c], b)).to.be(c);
  });

  it('wraps from the last entry to the first', () => {
    expect(nextPickerEntry([a, b, c], c)).to.be(a);
  });

  it('toggles cleanly with exactly two entries', () => {
    expect(nextPickerEntry([a, b], a)).to.be(b);
    expect(nextPickerEntry([a, b], b)).to.be(a);
  });

  it('matches the active entry on method AND profile', () => {
    // Same method, different profile — must not be treated as the active one.
    const b2 = {method: 'qr-and-link', profile: 'OID4VP-combined'};
    expect(nextPickerEntry([b, b2], b)).to.be(b2);
    expect(nextPickerEntry([b, b2], b2)).to.be(b);
  });

  it('treats a null and an undefined profile as the same', () => {
    const agg = {method: 'dcapi'}; // no profile key
    expect(nextPickerEntry([a, b], agg)).to.be(b);
  });

  it('advances to the first entry when the active entry is absent or unknown',
    () => {
      expect(nextPickerEntry([a, b, c], null)).to.be(a);
      expect(nextPickerEntry([a, b, c], {method: 'nope'})).to.be(a);
    });
});

describe('switch-link switchLinkDestinationLabel', () => {
  it('returns empty string for no entry', () => {
    expect(switchLinkDestinationLabel({entry: null, t: makeT()})).to.be('');
  });

  it('prefers a resolving destinationLabelKey', () => {
    const t = makeT({switch_to_qr: 'Switch to QR'});
    const entry = {
      method: 'qr-and-link',
      destinationLabelKey: 'switch_to_qr',
      destinationLabel: 'literal fallback'
    };
    expect(switchLinkDestinationLabel({entry, t})).to.be('Switch to QR');
  });

  it('falls through an unresolved destinationLabelKey to the literal label',
    () => {
      const t = makeT({});
      const entry = {
        method: 'qr-and-link',
        destinationLabelKey: 'switch_to_qr',
        destinationLabel: 'a literal label'
      };
      expect(switchLinkDestinationLabel({entry, t})).to.be('a literal label');
    });

  it('uses the per-method default key when no override is set', () => {
    const t = makeT({
      switchLink_destination_dcapi: 'Open a wallet app instead'
    });
    const entry = {method: 'dcapi', profile: null};
    expect(switchLinkDestinationLabel({entry, t}))
      .to.be('Open a wallet app instead');
  });

  it('falls back to the interaction-method label, then the raw method', () => {
    // No per-method default key, but the interaction label resolves.
    const t1 = makeT({interactionMethod_chapi: 'Browser credential handler'});
    expect(switchLinkDestinationLabel({entry: {method: 'chapi'}, t: t1}))
      .to.be('Browser credential handler');
    // Nothing resolves — the raw method is the last resort.
    const t2 = makeT({});
    expect(switchLinkDestinationLabel({entry: {method: 'chapi'}, t: t2}))
      .to.be('chapi');
  });
});
