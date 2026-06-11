'use strict';

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'react-native'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // Disable base rule — @typescript-eslint/no-unused-vars is the TypeScript-aware replacement
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': ['warn', { allow: ['error'] }],
    '@typescript-eslint/no-explicit-any': 'error',
    // Too noisy at the foundation stage; re-evaluate at Phase B
    '@typescript-eslint/explicit-function-return-type': 'off',
    // React 17+ JSX transform — no need to import React in every file
    'react/react-in-jsx-scope': 'off',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
};
