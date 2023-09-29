module.exports = {
  root: true,
  parserOptions: {
    ecmaVersiosn: 2020
  },
  env: {
    node: true
  },
  extends: [
    'digitalbazaar'
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/'
  ],
  rules: {
    'linebreak-style': [
      'error',
      (process.platform === 'win32' ? 'windows' : 'unix')
    ]
  }
};
