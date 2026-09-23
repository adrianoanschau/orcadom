import { createEslintConfig } from '@orcadom/config/eslint';

export default [
  ...createEslintConfig(import.meta.dirname),
  {
    files: ['**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
