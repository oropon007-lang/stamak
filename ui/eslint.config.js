import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ui-catalog 規約ゾーン (src/ui/) 用ルール (infra/eslint/parent-strict.cjs と整合)
const uiCatalogParentStrict = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@ui-catalog/core/*/*'],
            message:
              'ui-catalog の深い内部パスへの import は禁止。公開 entry (@ui-catalog/core/atoms など) を使ってください。',
          },
          {
            group: ['@/*', '~/*'],
            message:
              'src/ui/ 配下ではプロジェクト固有モジュールの import を禁止。業務ロジックは props で受け取ってください。',
          },
        ],
      },
    ],
  },
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ...uiCatalogParentStrict,
  },
])
