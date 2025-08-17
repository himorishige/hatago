# Hatago コードスタイルと規約

## TypeScript設定
- **Target**: ES2022
- **Module**: ESNext (bundler)
- **Strict mode**: 有効
- **Declaration**: 有効（型定義ファイル生成）
- **Source maps**: 有効

### 厳格な型設定
- `exactOptionalPropertyTypes: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `noUncheckedIndexedAccess: true`
- `useUnknownInCatchVariables: true`

## コードフォーマット（Prettier）
- **Print width**: 100文字
- **Single quotes**: true
- **Semicolons**: false (ASI使用)
- **Trailing commas**: es5
- **Arrow parens**: avoid
- **Tab width**: 2スペース
- **Line ending**: LF

## リンター（Biome）
- **Recommended rules**: 有効
- **Import organization**: 自動
- **未使用変数**: エラー扱い
- **Import type**: エラー扱い（型インポートの明示）
- **Non-null assertion**: 無効化（安全性重視）
- **Explicit any**: 許可（一部の場合）

### 重要なルール
- `useNodejsImportProtocol: error` - Node.jsプロトコル使用強制
- `useConsistentArrayType: error` - 配列型記法統一
- `noDelete: error` - delete演算子禁止
- `useImportType: error` - 型インポート明示

## ファイル拡張子規約
- **TypeScript**: `.ts`
- **型定義**: `.d.ts`
- **設定ファイル**: `.json` または `.jsonc`
- **インポート**: `.js` 拡張子を明示（ESM準拠）

## 命名規約
- **変数・関数**: camelCase
- **型・インターフェース**: PascalCase
- **定数**: UPPER_SNAKE_CASE
- **ファイル名**: kebab-case または camelCase
- **パッケージ名**: kebab-case with scope (@hatago/xxx)

## ディレクトリ構造規約
```
packages/
├── core/           # フレームワークコア
├── adapter-*/      # ランタイムアダプター
├── plugin-*/       # 公式プラグイン
└── hono-mcp/       # MCP Transport

src/
├── types/          # 型定義
├── middleware/     # ミドルウェア
├── transport/      # トランスポート層
└── plugins/        # プラグイン実装
```

## インポート規約
- **相対パス**: 同一パッケージ内
- **絶対パス**: 外部パッケージ
- **拡張子**: `.js` を明示（`.ts` ではない）
- **型インポート**: `import type` を使用

## エクスポート規約
- **Named exports**: 推奨
- **Default exports**: 設定ファイルのみ
- **Re-exports**: `index.ts` でのAPIサーフェス制御