/*!
 * Copyright 2023 - 2024 California Department of Motor Vehicles
 * Copyright 2023 - 2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const defaultTranslations = {
  en: {
    translate: 'Translate',
    loginCta: 'Login with your credential wallet',
    loginExplain: 'To login with your credential wallet, you will need ' +
      'to have a credential wallet app installed',
    appInstallExplain: 'If you don\'t have a credential wallet yet, ' +
      'see suggested wallets at the <a href="https://vcplayground.org/">' +
      'Verifiable Credentials Playground</a>',
    appCta: 'Open wallet app',
    'appCta-chapi-label': '',
    'appCta-openid4vp-label': '',
    exchangeActiveGoBack: 'Go back',
    exchangeActiveExpiryMessage:
      'Please complete the exchange in the allotted time:',
    exchangeErrorTitle: 'The exchange failed.',
    exchangeErrorSubtitle: 'The following error was encountered:',
    exchangeErrorTtlExpired: 'The exchange has expired.',
    exchangeResetTitle: 'You may try again.',
    exchangeReset: 'Retry',
    noSchemeHandlerTitle: 'Could not launch app',
    noSchemeHandlerMessage:
      'The wallet app may not be installed on this device.',
    qrTitle: 'Login with your Wallet app',
    qrPageExplain: 'Scan the following QR Code using a Wallet app on your ' +
    'phone.',
    qrFooter: 'Note: Already on your phone with a Wallet app? Open the ' +
      'Wallet app, then come back and tap on the QR code above.',
    qrFooterHelp: '',
    qrDisclaimer: `If you don't have a Wallet app download it from the` +
    `app store.`,
    openid4vpAnotherWay: 'Scan a QR code',
    openid4vpAnotherWayLabel: '',
    openid4vpQrAnotherWay: 'Use a wallet on this device.',
    openid4vpQrAnotherWayLabel: '',
    qrClickMessage: `The Wallet app must be running in the background.`,
    chapiPageAnotherWay: 'Looking for a QR code to scan with your wallet app ' +
      'instead?',
    copyright: 'Powered by OpenCred',
    home: 'Home'
  }
};

export const combineTranslations = (customTranslations, defaults) => {
  const dt = defaults || defaultTranslations;
  const combined = {};
  Object.keys(dt).forEach(lang => {
    combined[lang] = Object.assign(
      {},
      dt[lang],
      customTranslations[lang] || {}
    );
  });

  Object.keys(customTranslations).forEach(lang => {
    if(!dt[lang]) {
      // Ensure there are no empty strings in any translation, even if
      // it means a partially translated interface
      combined[lang] = Object.assign({}, dt.en, customTranslations[lang]);
    }
  });
  return combined;
};
