export const defaultTranslations = {
  en: {
    translate: 'Translate',
    loginCta: 'Login with your credential wallet',
    loginExplain: 'To login with your credential wallet, you will need ' +
    'to have a credential wallet app installed',
    appInstallExplain: 'If you don\'t have a credential wallet yet, ' +
    'see suggested wallets at the ' +
    '<a href="https://vcplayground.org/">Verifiable Credentials Playground</a>',
    appCta: 'Open wallet app',
    'appCta-chapi-label': '',
    'appCta-openid4vp-label': '',
    qrTitle: 'Login with your Wallet app',
    qrPageExplain: 'Scan the following QR Code using a Wallet app on your ' +
    'phone.',
    qrFooter: 'Note: Already on your phone with a Wallet app? Open the ' +
    'Wallet app, then come back and tap on the QR code above.',
    qrDisclaimer: `If you don't have a Wallet app download it from the` +
    `app store.`,
    qrPageAnotherWay: `Want to try another way?`,
    qrClickMessage: `The Wallet app must be running in the background.`,
    chapiPageAnotherWay: 'Looking for a QR Code to scan with your wallet app ' +
    'instead?',
    copyright: 'Powered by OpenCred',
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
