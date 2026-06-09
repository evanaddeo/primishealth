'use strict';

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    // Disable base rule — @typescript-eslint/no-unused-vars is the TypeScript-aware replacement
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': ['warn', { allow: ['error'] }],
    '@typescript-eslint/no-explicit-any': 'error',
    // Too noisy at the foundation stage; re-evaluate at Phase B
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
};
