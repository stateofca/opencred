/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Resolve the exchange-page subtitle for the current platform.
 *
 * `exchangePageExplain` is the base (desktop) subtitle. A deployment may set
 * `exchangePageExplainMobile` to show different copy on mobile; when it is
 * absent (resolves to its own key) or empty, the base subtitle is used. This
 * mirrors the `desktopLabelKey`/`labelKey` precedence used for DC API buttons,
 * inverted: the base key is the default and mobile is the opt-in override.
 *
 * @param {object} options - Options.
 * @param {Function} options.t - The vue-i18n `t` function (or a compatible
 *   stub in tests). A missing key resolves to itself.
 * @param {boolean} options.isMobile - Whether the current platform is mobile
 *   (iOS or Android).
 * @returns {string} The subtitle to display.
 */
export function resolveExchangeSubtitle({t, isMobile} = {}) {
  if(isMobile) {
    const mobile = t('exchangePageExplainMobile');
    if(mobile && mobile !== 'exchangePageExplainMobile') {
      return mobile;
    }
  }
  return t('exchangePageExplain', undefined);
}
