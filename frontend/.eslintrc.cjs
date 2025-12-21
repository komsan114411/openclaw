/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript'],
  rules: {
    // Existing codebase uses `any` in many places; do not block CI.
    '@typescript-eslint/no-explicit-any': 'off',
    // Many pages intentionally ignore certain response fields/errors.
    '@typescript-eslint/no-unused-vars': 'off',
  },
};

