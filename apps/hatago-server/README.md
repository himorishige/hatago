# Hatago

軽量・高速・シンプルな **remote MCP サーバー** のひな型。  
**Hono + @hono/mcp + MCP TypeScript SDK** を使い、プラグインで拡張できる。

- コアは小さく：`src/app.ts` と最小のプラグインローダーのみ
- 環境非依存：Node / Cloudflare Workers 両対応
- プラグイン式：OAuth PRM 公開と、**stream で "Hello Hatago"** を返すテストツールを同梱

## すぐ試す

```bash
pnpm i # あるいは npm i / bun i
pnpm dev
# → http://localhost:8787/health で OK を確認
```

Cloudflare Workers (wrangler) のローカル実行：

```bash
pnpm dev:cf
```

## エンドポイント

- `POST /mcp` … Streamable HTTP での MCP エンドポイント（@hono/mcp）
- `GET /.well-known/oauth-protected-resource` … OAuth Protected Resource Metadata (RFC 9728)
- `GET /health` … ヘルスチェック

## 組み込みプラグイン

- `hello-hatago` … ツール `hello.hatago` を追加。**progress 通知**で "Hello Hatago" を一文字ずつ送って、最後に結果を返す
- `oauth-metadata` … PRM を配信し、必要なら `/mcp` に Bearer 認可を強制する（デフォルトは強制しない）
- `github-oauth` … GitHub OAuth Device Flow 認証。ブラウザ不要でMCP経由でGitHub APIを使用

### OAuth設定環境変数：

- `AUTH_ISSUER` … Authorization Server の issuer（例: `https://auth.example.com`）
- `RESOURCE` … リソース識別子 URL（省略時はリクエストの origin から自動）
- `REQUIRE_AUTH` … `"true"` のとき `/mcp` に Bearer を要求

### GitHub OAuth設定：

- `GITHUB_CLIENT_ID` … GitHub OAuth App の Client ID（必須）
- `GITHUB_CLIENT_SECRET` … GitHub OAuth App の Client Secret（推奨、トークン取り消しに必要）
- `GITHUB_OAUTH_SCOPE` … OAuth スコープ（デフォルト: `public_repo read:user`）

## GitHub OAuth App セットアップ

### 1. GitHub OAuth App作成

1. https://github.com/settings/applications/new にアクセス
2. 以下を入力：
   - **Application name**: `Hatago MCP Server`
   - **Homepage URL**: `https://github.com/your-username/hatago`
   - **Authorization callback URL**: `http://localhost:8787/callback`（Device Flowでは未使用だが必須）
3. **Register application** をクリック
4. Client ID と Client Secret を取得

### 2. Cloudflare Workers環境での設定

#### A. Client IDの設定

`wrangler.jsonc` の環境変数に追加（既に設定済み）：

```jsonc
{
  "vars": {
    "GITHUB_CLIENT_ID": "Ov23li...", // 取得したClient ID
  },
}
```

#### B. Client Secretの設定（セキュア）

```bash
# 開発環境
wrangler secret put GITHUB_CLIENT_SECRET --env development
# 入力プロンプトで取得したClient Secretを入力

# 本番環境
wrangler secret put GITHUB_CLIENT_SECRET --env production
```

### 3. デバイスフロー認証の使用

#### ⚠️ セキュリティ注意事項

**現在の実装は単一ユーザー環境向けです。**

- **本番環境での制限**: 複数ユーザーが同時にアクセスする環境では、セッション競合が発生する可能性があります
- **推奨用途**: 個人開発、テスト環境、単一ユーザーのMCPクライアント
- **本番対応**: 複数ユーザー環境では、HTTPセッション管理や専用認証レイヤーの実装が必要です

#### 利用可能なMCPツール

デバイスフロー認証は以下のMCPツールを提供：

- `github_auth_start` … 認証開始（user_codeとverification_uriを取得）
- `github_auth_status` … 認証状態確認（ポーリング）
- `github_logout` … ログアウト・トークン取り消し
- `github_user_authenticated` … 認証済みユーザー情報取得
- `github_repos_authenticated` … 認証済みリポジトリ一覧

#### 使用例：

```bash
# 1. 認証開始
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{"name":"github_auth_start","arguments":{}}
}'
# → user_code と verification_uri を取得

# 2. ブラウザで https://github.com/login/device にアクセスしてuser_codeを入力

# 3. 認証状態確認
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":2,"method":"tools/call",
  "params":{"name":"github_auth_status","arguments":{}}
}'

# 4. 認証完了後、GitHub APIを使用
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"github_user_authenticated","arguments":{}}
}'
```

## ツール呼び出し（curl お試し）

> 注: progress のストリームは MCP クライアントが `params._meta.progressToken` を付けた時のみ送られる。  
> 以下は最小例。クライアント実装（Cursor, Claude Desktop, Copilot Chat など）だと進捗が UI に出る。

1. initialize

```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0",
  "id":1,
  "method":"initialize",
  "params":{
    "protocolVersion":"2025-06-18",
    "capabilities":{},
    "clientInfo":{"name":"curl","version":"0.0.0"}
  }
}'
```

2. tools/list

```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0",
  "id":2,
  "method":"tools/list"
}'
```

3. tools/call で progress 有効化（トークンを付ける）

```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0",
  "id":3,
  "method":"tools/call",
  "params":{
    "name":"hello.hatago",
    "arguments":{},
    "_meta":{"progressToken":"hello-1"}
  }
}'
```

> サーバーは progress を `notifications/progress` で返す。HTTP 経由の視認はクライアント依存。

## プラグインを追加する

`src/plugins/index.ts` に登録するだけ。`HatagoPlugin` は以下の形：

```ts
export type HatagoPlugin = (ctx: {
  app: Hono
  server: McpServer
  env?: Record<string, unknown>
  getBaseUrl: (req: Request) => URL
}) => void | Promise<void>
```

- MCP のツール・リソースなどは `server.registerTool(...)` で追加
- Hono のルートやミドルウェアは `app.get(...)` / `app.use(...)` で追加

## 参考

- @hono/mcp の使い方（Hono で Streamable HTTP を張る）  
  npm / jsr の README を参照（`app.post('/mcp', mcp(server))` の例あり）。
- MCP 仕様（2025-06-18 / Streamable HTTP / progress 通知 / OAuth PRM）

## ライセンス

MIT
