module.exports = {
  root: true,
  env: {
    node: true
  },
  extends: [
    'digitalbazaar',
    'digitalbazaar/module'
  ],
  ignorePatterns: [
    'node_modules/'
  ],
  rules: {
    'linebreak-style': [
      'error',
      (process.platform === 'win32' ? 'windows' : 'unix')
    ],
    'unicorn/prefer-node-protocol': 'error'
  }
};
