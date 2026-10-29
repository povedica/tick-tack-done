// ESLint flat config compartida por todo el monorepo.
// Convención: cada app/package puede extenderla desde su propio eslint.config.mjs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Reglas de negocio puras: prohibido importar frameworks en packages/domain (ver .cursor/rules/50-domain.mdc)
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    ignores: ['apps/web/src/sw.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
    },
  },
  {
    files: [
      'apps/web/src/features/places/**/*.{ts,tsx}',
      'apps/web/src/features/calendar/**/*.{ts,tsx}',
      'apps/web/src/shell/CalendarSidebar.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message:
            'Use dateTimeFormat() from apps/web/src/lib/dates/formatters.ts. The calendar keeps one formatter per locale and options.',
        },
      ],
    },
  },
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@nestjs/*',
            'express',
            'fastify',
            'react',
            'react-dom',
            'prisma',
            '@prisma/*',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    files: ['**/*config*.ts', '**/*.config.mjs', 'eslint.config.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
