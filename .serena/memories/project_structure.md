# Hatago プロジェクト構造

## ルートディレクトリ構成

```
hatago/
├── packages/           # モノレポパッケージ群
├── apps/              # サンプルアプリケーション
├── examples/          # 外部MCPサーバー例
├── templates/         # プロジェクトテンプレート
├── tests/             # 統合テスト
├── docs/              # ドキュメント
├── benchmarks/        # パフォーマンステスト
├── package.json       # ルートパッケージ設定
├── pnpm-workspace.yaml # pnpm ワークスペース設定
├── tsconfig.base.json # TypeScript 基底設定
├── vitest.config.ts   # テスト設定
├── biome.json         # リンター設定
├── .prettierrc.json   # フォーマッター設定
├── hatago.config.jsonc # Hatago設定
└── CLAUDE.md          # AI開発ガイド
```

## Packages ディレクトリ詳細

### コアフレームワーク

- **`packages/core/`**: フレームワークの中核
  - `src/app.ts`: アプリケーションファクトリー
  - `src/types.ts`: 型定義
  - `src/plugins.ts`: プラグインシステム
  - `src/adapter.ts`: アダプター抽象化

### ランタイムアダプター

- **`packages/adapter-node/`**: Node.js 実行環境用
- **`packages/adapter-workers/`**: Cloudflare Workers用
- **`packages/adapter-bun/`**: Bun実行環境用
- **`packages/adapter-deno/`**: Deno実行環境用

### 開発ツール

- **`packages/cli/`**: コマンドラインインターフェース
- **`packages/hatago-config/`**: 設定管理システム
- **`packages/hono-mcp/`**: Hono用MCPトランスポート

### 公式プラグイン

- **`packages/plugin-hello-hatago/`**: デモプラグイン
- **`packages/plugin-logger/`**: 構造化ログ
- **`packages/plugin-oauth-metadata/`**: OAuth PRM (RFC 9728)
- **`packages/plugin-rate-limit/`**: レート制限
- **`packages/plugin-concurrency-limiter/`**: 同時実行制御
- **`packages/plugin-kv/`**: キーバリューストレージ
- **`packages/plugin-github-oauth/`**: GitHub OAuth統合

## Apps ディレクトリ

### サンプルアプリケーション

- **`apps/hatago-server/`**: 本格的なサーバー実装例
  - `src/app.ts`: メインアプリケーション
  - `src/stdio-server.ts`: stdio トランスポート
  - `src/config/`: 設定管理
  - `src/plugins/`: プラグイン実装
  - `src/utils/`: ユーティリティ

- **`apps/test-mcp-servers/`**: テスト用MCPサーバー群

## Examples ディレクトリ

- **`examples/external-mcp-clock/`**: 時計MCPサーバー例
- **`examples/external-mcp-math/`**: 数学MCPサーバー例

## 主要設定ファイル

### TypeScript設定

- **`tsconfig.base.json`**: 基底TypeScript設定
- **各パッケージ**: 個別のtsconfig.json

### テスト設定

- **`vitest.config.ts`**: Vitest設定（全体）
- **`vitest.workspace.ts`**: ワークスペース設定

### 品質管理設定

- **`biome.json`**: リンター・フォーマッター設定
- **`.prettierrc.json`**: Prettier設定
- **`.prettierignore`**: フォーマット除外ファイル

### パッケージ管理

- **`pnpm-workspace.yaml`**: pnpm ワークスペース定義
- **`.npmrc`**: npm/pnpm設定

## プラグインアーキテクチャ

### プラグインタイプ定義

```typescript
export type HatagoPlugin = (ctx: HatagoContext) => void | Promise<void>

export type HatagoContext = {
  app: Hono // HTTP ルート登録
  server: McpServer // MCP ツール/リソース登録
  env?: Record<string, unknown> // 環境変数
  getBaseUrl: (req: Request) => URL // ベースURL取得
}
```

### プラグイン登録パターン

1. `src/plugins/` にプラグイン実装作成
2. `src/plugins/index.ts` で登録
3. MCPツール: `server.registerTool()` 使用
4. HTTPエンドポイント: `app.get()` / `app.post()` 使用

## 重要なディレクトリ

### セキュリティ関連

- **`packages/core/src/security/`**: セキュリティ機能
- **`packages/core/src/middleware/`**: セキュリティミドルウェア

### トランスポート層

- **`packages/core/src/transport/`**: トランスポート抽象化
- **`packages/hono-mcp/src/`**: HTTP/SSE実装

### ログ・監視

- **`packages/core/src/logger/`**: 構造化ログシステム
- **`packages/plugin-logger/`**: プラグイン型ログ機能
