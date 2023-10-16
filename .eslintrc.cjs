module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2020
  },
  env: {
    node: true
  },
  extends: [
    'digitalbazaar',
    'digitalbazaar/module'
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/'
  ],
  rules: {
    'linebreak-style': [
      'error',
      (process.platform === 'win32' ? 'windows' : 'unix')
    ],
    'unicorn/prefer-node-protocol': 'error'
  }
};
