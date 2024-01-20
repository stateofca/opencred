export const defaultTranslations = {
  en: {
    translate: 'Translate',
    loginCta: 'Log in with your credential wallet',
    loginExplain: 'To log in with your credential wallet, you will need ' +
    'to have the credential wallet app installed',
    appInstallExplain: 'If you don\'t have a credential wallet yet, ' +
    'see suggested wallets at the ' +
    '<a href="https://vcplayground.org/">Verifiable Credentials Playground</a>',
    appCta: 'Open wallet app',
    'appCta-chapi-button': '',
    'appCta-openid4vp-link': '',
    qrExplain: 'Looking for a QR Code to scan with your wallet app instead?',
    qrCta: 'Scan a QR Code with your wallet app',
    qrPageCta: 'Scan QR Code from within your digital wallet app.',
    qrPageExplain: '',
    qrPageAnotherWay: 'Or, log in with a wallet on this device',
    qrPageAnotherWayLink: 'Try another way',
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
