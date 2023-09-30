export const defaultTranslations = {
  en: {
    translate: 'Translate',
    login_cta: 'Log in with your credential wallet',
    login_explain: 'To log in with your credential wallet, you will need ' +
    'to have the credential wallet app installed',
    app_install_explain: 'If you don\'t have a credential wallet yet, ' +
    'see suggested wallets at the ' +
    '<a href="https://vcplayground.org/">Verifiable Credentials Playground</a>',
    app_cta: 'Open wallet app',
    qr_explain: 'Looking for a QR Code to scan with your wallet app instead?',
    qr_cta: 'Scan a QR Code with your wallet app',
    qr_page_cta: 'Scan QR Code from within your digital wallet app.',
    qr_page_explain: '',
    qr_page_another_way: 'Or, log in with a wallet on this device',
    qr_page_another_way_link: 'Try another way',
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
