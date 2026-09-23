import { createEslintConfig } from '@orcadom/config/eslint';

export default [
  ...createEslintConfig(import.meta.dirname),
  {
    ignores: ['vitest.config.ts'],
  },
  {
    files: ['**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
