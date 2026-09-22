import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Configuração compartilhada do monorepo.
 * Apps passam o próprio diretório para o type-aware lint achar o tsconfig certo.
 */
export function createEslintConfig(tsconfigRootDir) {
  return tseslint.config(
    {
      ignores: [
        '**/dist/**',
        '**/.next/**',
        '**/.turbo/**',
        '**/node_modules/**',
        '**/coverage/**',
        '**/src/generated/**',
        'pnpm-lock.yaml',
      ],
    },
    eslint.configs.recommended,
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    eslintConfigPrettier,
  );
}

export default createEslintConfig(import.meta.dirname);
