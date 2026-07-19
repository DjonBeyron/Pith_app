import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist/.claude — не код приложения; old/ — легаси-оболочка вне git и сборки
  // (в CI её нет; игнор нужен чтобы локальный `eslint .` совпадал с CI);
  // e2e-артефакты Playwright — сгенерированное
  globalIgnores(['dist', '.claude', 'old', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      // __BUILD_TIME__ — define из vite.config.js (время сборки), не настоящий глобал
      globals: { ...globals.browser, __BUILD_TIME__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Hard ceiling against the "one giant file" problem from ver 1 (BlockEditorChat.jsx
      // grew to thousands of lines over time). Soft target is 250 lines (see CLAUDE.md) —
      // this is the hard limit that actually fails `npm run lint`.
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // E2E-тесты Playwright (этап 5.5): бегут в node, читают process.env; внутри
    // page.evaluate — браузерные globals. React-правила тут не нужны.
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])
