/**
 * 複製先プロジェクトの src/ui/ ゾーンを ui-catalog 規約で縛る ESLint 設定。
 *
 * 使い方（例）:
 *
 *   // eslint.config.js (flat) もしくは .eslintrc.cjs
 *   module.exports = {
 *     overrides: [
 *       {
 *         files: ['src/ui/**\/*.{ts,tsx}'],
 *         extends: ['./packages/ui-catalog/infra/eslint/parent-strict.cjs'],
 *       },
 *     ],
 *   }
 *
 * 縛るもの（README の【違反】ルール）:
 *   - 深い import 禁止（@ui-catalog/core/*\/*）
 *   - プロジェクト固有モジュール（@/*, ~/*）の import 禁止
 *
 * 縛らないもの:
 *   - スタイル方針（README の【推奨】で Tailwind v4 推奨、SCSS Module 併用可）
 *   - 依存方向違反（atoms → molecules）— カスタムルール必要、後日
 *   - ビジネスロジック検出（fetch / axios 禁止）— プロジェクト依存度が高い、後日
 */

module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@ui-catalog/core/*/*'],
            message:
              'ui-catalog の深い内部パスへの import は禁止。公開 entry（@ui-catalog/core/atoms など）を使ってください。',
          },
          {
            group: ['@/*', '~/*'],
            message:
              'src/ui/ 配下では親アプリ固有モジュールの import を禁止。業務ロジックは props で受け取ってください。',
          },
        ],
      },
    ],
  },
}
