# Hatago タスク完了時のチェックリスト

## 開発完了時の必須チェック

### 1. コード品質チェック

```bash
# リント実行（必須）
pnpm lint

# フォーマット確認（必須）
pnpm format

# 統合チェック（推奨）
pnpm check
```

### 2. タイプチェック

```bash
# TypeScript型チェック（必須）
pnpm typecheck
```

### 3. テスト実行

```bash
# 全テスト実行（必須）
pnpm test

# カバレッジ確認（推奨）
pnpm test:coverage
```

### 4. ビルド確認

```bash
# 全パッケージビルド（必須）
pnpm build
```

## セキュリティチェック

### OAuth設定確認

- `REQUIRE_AUTH=true` が本番環境で設定されているか
- OAuth メタデータエンドポイントが正常に動作するか
- Bearer token検証が適切に機能するか

### ログ設定確認

- `NOREN_MASKING=true` でPII マスキングが有効か
- `LOG_FORMAT=json` で構造化ログが出力されるか
- 機密情報がログに出力されていないか

## MCP機能テスト

### 基本機能確認

```bash
# Health check
curl http://localhost:8787/health

# MCP初期化
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# ツール一覧
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### Transport テスト

- stdio モード：`pnpm dev:stdio` で動作確認
- HTTP モード：`pnpm dev` で動作確認
- 両方のトランスポートで同じ機能が提供されるか

## パフォーマンスチェック

### 起動時間確認

- 開発サーバーが2秒以内に起動するか
- ビルド時間が合理的範囲内か

### メモリ使用量

- メモリリークが発生していないか
- 長時間実行でメモリ使用量が安定しているか

## 本番環境デプロイ前チェック

### 環境変数設定

- 必要な環境変数がすべて設定されているか
- 機密情報が適切に管理されているか

### 設定ファイル確認

- `hatago.config.json` が適切に設定されているか
- プロキシ設定が正しく動作するか

### セキュリティ最終確認

- Origin validation が実装されているか
- Rate limiting が設定されているか
- Audit logging が有効になっているか

## ドキュメント更新

### コード変更時

- README.md の更新が必要か
- CLAUDE.md の更新が必要か
- API仕様の変更があるか

### 新機能追加時

- プラグインドキュメントの更新
- 使用例の追加
- バージョン管理情報の更新

## リリース準備

### Changeset

```bash
# 変更内容の記録
pnpm changeset

# バージョンアップの準備
pnpm changeset:version
```

### 最終確認

- 全てのテストがパスしているか
- ビルドエラーがないか
- セキュリティ要件を満たしているか
- パフォーマンス要件を満たしているか
