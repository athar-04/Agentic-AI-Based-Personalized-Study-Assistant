// Root ESLint flat config for all TypeScript workspaces.
// Workspace `lint` scripts run `eslint src` (or `eslint .` for web) and resolve this file upward.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/next-env.d.ts',
      'agents/**',
      '.venv/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      // Bugs that type info catches — keep these as errors.
      '@typescript-eslint/no-floating-promises': 'error',
      // arguments: async Express handlers; attributes: async React onSubmit/onClick.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false, attributes: false } }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'smart'],

      // `any` is how most of the auth/mass-assignment bugs slipped through; surface it without blocking.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      // ESLint's type view of Express (@types/express@5 vs express@4) differs from tsc's, so this rule's
      // autofix removes casts tsc still needs. Re-enable once the @types/express version is aligned.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },

  // Next.js frontend
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },

  // node:test's describe()/test() return promises that the runner itself awaits.
  {
    files: ['apps/*/test/**/*.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },

  // Dev scripts (local database, launcher, smoke test): not part of any tsconfig, so no type-aware rules.
  {
    files: ['scripts/**/*.mjs', 'scripts/dev/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Vendored shadcn/ui components: keep upstream code as-is.
  {
    files: ['apps/web/src/components/ui/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
