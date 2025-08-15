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

環境変数：

- `AUTH_ISSUER` … Authorization Server の issuer（例: `https://auth.example.com`）
- `RESOURCE` … リソース識別子 URL（省略時はリクエストの origin から自動）
- `REQUIRE_AUTH` … `"true"` のとき `/mcp` に Bearer を要求

## ツール呼び出し（curl お試し）

> 注: progress のストリームは MCP クライアントが `params._meta.progressToken` を付けた時のみ送られる。  
> 以下は最小例。クライアント実装（Cursor, Claude Desktop, Copilot Chat など）だと進捗が UI に出る。

1) initialize

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

2) tools/list

```bash
curl -sS http://localhost:8787/mcp -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0",
  "id":2,
  "method":"tools/list"
}'
```

3) tools/call で progress 有効化（トークンを付ける）

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
