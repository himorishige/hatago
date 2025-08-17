# Hatago 推奨コマンド

## 基本開発コマンド

### 依存関係管理

```bash
# 依存関係インストール
pnpm i

# 依存関係を追加
pnpm add <package>

# 開発依存関係を追加
pnpm add -D <package>
```

### 開発サーバー

```bash
# Node.js HTTP モード（推奨）
pnpm dev

# stdio モード（Claude Desktop用）
pnpm dev:stdio

# Cloudflare Workers モード
pnpm dev:cf
```

### ビルドとタイプチェック

```bash
# 全パッケージビルド
pnpm build

# タイプチェック
pnpm typecheck

# クリーンビルド
pnpm clean && pnpm build
```

### テスト

```bash
# テスト実行
pnpm test

# ウォッチモード
pnpm test:watch

# カバレッジ付きテスト
pnpm test:coverage

# テストUI
pnpm test:ui
```

### コード品質

```bash
# リント（Biome）
pnpm lint

# リント修正
pnpm lint:fix

# フォーマット確認（Prettier）
pnpm format

# フォーマット修正
pnpm format:fix

# 統合チェック＆修正（Biome）
pnpm check:fix
```

### 本番環境

```bash
# HTTPサーバー起動
pnpm start

# stdioサーバー起動
pnpm start:stdio
```

### バージョン管理とリリース

```bash
# Changeset追加
pnpm changeset

# バージョンアップ
pnpm changeset:version

# パブリッシュ
pnpm changeset:publish
```

## システムユーティリティ（macOS）

### ファイル操作

```bash
# ファイル一覧
ls -la

# ディレクトリ検索
find . -type d -name "pattern"

# ファイル検索
find . -type f -name "*.ts"

# 内容検索
grep -r "pattern" src/
```

### Git操作

```bash
# ステータス確認
git status

# 差分確認
git diff

# ブランチ一覧
git branch -a

# コミット履歴
git log --oneline -10
```

### プロセス管理

```bash
# ポート使用状況確認
lsof -i :8787

# プロセス検索
ps aux | grep node
```

## MCP テストコマンド

### Health Check

```bash
curl http://localhost:8787/health
```

### MCP 初期化

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

### ツール一覧取得

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

## 環境変数設定例

### 開発環境

```bash
export LOG_LEVEL=debug
export LOG_FORMAT=pretty
export REQUIRE_AUTH=false
export HATAGO_TRANSPORT=http
```

### 本番環境

```bash
export LOG_LEVEL=info
export LOG_FORMAT=json
export REQUIRE_AUTH=true
export NOREN_MASKING=true
export AUTH_ISSUER=https://auth.example.com
```
