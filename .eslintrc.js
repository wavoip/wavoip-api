module.exports = {
  extends: [
    'airbnb-base/legacy',
    'prettier',
    'plugin:vue/recommended',
    'plugin:storybook/recommended',
    'plugin:cypress/recommended',
  ],
  parserOptions: {
    parser: '@babel/eslint-parser',
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['html', 'prettier', 'babel'],
  rules: {
    'prettier/prettier': ['error'],
    'camelcase': 'off',
    'no-param-reassign': 'off',
    'import/no-extraneous-dependencies': 'off',
    'import/prefer-default-export': 'off',
    'import/no-named-as-default': 'off',
    'import/no-unresolved': 'off',
    'import/extensions': ['off'],
    'no-console': 'error',
  },
  settings: {
    'import/resolver': {
      webpack: {
        config: 'config/webpack/resolve.js',
      },
    },
  },
  env: {
    browser: true,
    node: true,
  },
  globals: {
    bus: true,
    vi: true,
  },
};
