import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typed = ['api/**/*.ts', 'shared/**/*.ts', 'web/**/*.{ts,tsx}'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.vitest/**', '**/data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({ ...c, files: typed })),
  ...tseslint.configs.stylistic.map((c) => ({ ...c, files: typed })),
  {
    files: typed,
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  { files: ['**/*.{js,mjs}'], ...tseslint.configs.disableTypeChecked },
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name=/^(prepare|exec)$/] > TemplateLiteral[expressions.length>0]',
          message: 'Use parameterised queries, never build SQL from strings.',
        },
      ],
    },
  },
  {
    files: typed,
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['api/src/routes/**'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    files: ['api/test/**', 'web/test/**'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['api/src/cli/**', 'scripts/**', 'api/scripts/**', 'api/test/**', 'web/test/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-properties': ['error', { property: 'innerHTML', message: 'Never write raw HTML.' }],
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Never inject raw HTML.' },
      ],
    },
  },
  { files: ['web/**/*.tsx'], ...jsxA11y.configs.recommended },
);
