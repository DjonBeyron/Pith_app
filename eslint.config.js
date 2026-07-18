import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // .claude — служебные worktree/файлы Claude Code, это не код приложения
  globalIgnores(['dist', '.claude']),
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
])
