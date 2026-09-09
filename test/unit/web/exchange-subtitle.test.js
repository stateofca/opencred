/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';
import {resolveExchangeSubtitle} from '../../../web/utils/exchange-subtitle.js';

// A stub translator over a fixed dictionary. A key with no entry resolves to
// itself, matching vue-i18n's missing-key behavior.
const makeT = dict => key => (key in dict ? dict[key] : key);

describe('resolveExchangeSubtitle', () => {
  it('uses exchangePageExplain on desktop', () => {
    const t = makeT({
      exchangePageExplain: 'Desktop subtitle',
      exchangePageExplainMobile: 'Mobile subtitle'
    });
    expect(resolveExchangeSubtitle({t, isMobile: false}))
      .to.be('Desktop subtitle');
  });

  it('uses exchangePageExplainMobile on mobile when it resolves', () => {
    const t = makeT({
      exchangePageExplain: 'Desktop subtitle',
      exchangePageExplainMobile: 'Mobile subtitle'
    });
    expect(resolveExchangeSubtitle({t, isMobile: true}))
      .to.be('Mobile subtitle');
  });

  it('falls back to exchangePageExplain on mobile when the mobile key ' +
    'is not set (resolves to itself)', () => {
    const t = makeT({exchangePageExplain: 'Only subtitle'});
    expect(resolveExchangeSubtitle({t, isMobile: true}))
      .to.be('Only subtitle');
  });

  it('falls back on mobile when the mobile key is empty', () => {
    const t = makeT({
      exchangePageExplain: 'Base subtitle',
      exchangePageExplainMobile: ''
    });
    expect(resolveExchangeSubtitle({t, isMobile: true}))
      .to.be('Base subtitle');
  });
});
