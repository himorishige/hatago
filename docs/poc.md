……ふーん、軽量で速い魔法サーバーか。Hatagoの設計、ここにまとめるよ。コアは極力薄く、あとは全部プラグインで差し替え可能にする……だってその方が楽しいからね。

⸻

Hatago 技術仕様（PoC → v0.1）

前提：Hono と Hono の MCP ミドルウェア（@hono/mcp）で、リモート MCP サーバーを最小構成で立ち上げる。最初のプラグインは OAuth。PoC は 「Hello Hatago」をストリームで返すテストプラグインだけでいい。

1. ゴール / 非ゴール
	•	ゴール
	•	HTTPベースのリモート MCP（Streamable HTTP）を軽量実装
	•	環境非依存（Node / Deno / Bun / Cloudflare Workers / Edge）
	•	プラグイン式で機能追加（OAuth、他MCPサーバーの取り込み、ツール/リソースの追加）
	•	PoC：ストリーミングで “Hello Hatago” を返すツール
	•	非ゴール
	•	高度な永続化、重厚な管理UI、巨大な認可サーバー実装
	•	旧SSEトランスポート専用実装（互換は意識するが新実装はStreamable HTTP優先）。公式仕様でStreamable HTTP がHTTP+SSEを置き換えてるからだ。 ￼

⸻

2. コア・アーキテクチャ

2.1 Transport
	•	MCP: Streamable HTTP を採用。
	•	POST /mcp に JSON-RPC リクエスト（1件 or バッチ）。サーバーは application/json（一括）または text/event-stream（SSEで多メッセージ）で返せる。
	•	GET /mcp でサーバー→クライアントの通知用ストリームを開ける。
	•	セッションID は InitializeResult を返すレスポンスの Mcp-Session-Id ヘッダで払い出し可能。以降のすべてのHTTP要求に同ヘッダを必須にできる。Origin 検証やDNS Rebinding対策の注意点も仕様で定義済み。 ￼

2.2 MCP ライフサイクルとメソッド
	•	初回は initialize リクエストから。バッチに混ぜてはいけない。サーバーは自分の capabilities を返す。その後クライアントは notifications/initialized を送る。 ￼
	•	ツール呼び出しは tools/call。引数は JSON Schema に従う。 ￼
	•	進捗通知（progress） はオプション機能。クライアントが _meta.progressToken を渡すと、サーバーは notifications/progress を随時送れる。 ￼

2.3 Hono × MCP
	•	@hono/mcp の StreamableHTTPTransport を使い、Hono ルータに /mcp を1本だけ生やす。
	•	このミドルウェアは Cloudflare Workers / Node / Deno / Bun / Browser 動作を掲げているから、環境依存を最小化できる。 ￼
	•	Hono 自体が Web 標準で薄い……つまり魔法の杖の柄が軽い。ルーティングやCORSなど基礎も素直に足せる。 ￼
	•	MCP TS SDK（公式）を採用。サーバー／クライアント双方、Streamable HTTP もサポート。実装例と注意点（CORSで Mcp-Session-Id を露出させるなど）もREADMEにまとまってる。 ￼

⸻

3. プラグイン・システム

3.1 哲学

コアは 「路地宿（はたご）」 みたいに最低限。部屋（機能）は プラグインで増やす……まあ、探し求めてる時が一番楽しいんだよ。

3.2 形態
	•	ロード方法：ESM の import() で動的ロード。配布は npm でも JSR でもOK（Edge互換はJSR推奨）。
	•	Manifest（プラグインの自己申告）：

export type HatagoPlugin = {
  name: string
  version: string
  setup: (ctx: HatagoContext) => Promise<void> | void
  // Extension points（必要なものだけ実装）
  mcp?: {
    tools?: ToolRegistration[]
    resources?: ResourceRegistration[]
    onInitialize?: (ctx: SessionCtx) => Promise<void> | void
    onRequest?: (msg: JsonRpcMessage, ctx: SessionCtx) => Promise<void> | void
    onShutdown?: () => Promise<void> | void
  }
  http?: (app: Hono) => void // /.well-known など追加エンドポイント用
  auth?: OAuthProviderPlugin // OAuthプラグインの場合
  upstream?: UpstreamMcpAdapter // 下流MCPの取り込み
}


	•	ライフサイクル
	1.	Core 起動 → 2) setup() で登録 → 3) initialize 処理後に onInitialize() → 4) onRequest() でフック → 5) 終了時 onShutdown()

3.3 代表的なプラグイン種別
	•	Tool/Resource プラグイン
	•	server.registerTool(...) / server.registerResource(...) を内部で実行して登録する薄いラッパ。
	•	OAuth プラグイン（今回最優先）
	•	後述の Protected Resource Metadata と WWW-Authenticate をサーブする。
	•	Upstream MCP アダプタ
	•	既存の リモート MCP サーバーを 名前空間付きでマウントする。@modelcontextprotocol/sdk のクライアント（Streamable HTTP）で下流へ接続し、tools/list をキャッシュ、tools/call は転送。進捗通知はそのまま中継。
	•	注意：仕様上、ツール本体のストリーミング本文は標準化されておらず、進捗通知での段階表示が基本（クライアントの実装状況はまちまち）。 ￼ ￼

⸻

4. 認可（OAuth）プラグイン仕様

4.1 仕様ベース
	•	MCP の Authorization は OAuth 2.1 + PKCE を土台に、Protected Resource Metadata (RFC 9728) による認可サーバーの発見、WWW-Authenticate チャレンジを要求する。現行はドラフトだが要件は明確だ。 ￼
	•	Protected Resource Metadata は /.well-known/oauth-protected-resource に配置するのが定石。authorization_servers に少なくとも1つ列挙。401時の WWW-Authenticate でメタデータURLを示すのも必須。 ￼ ￼

4.2 エンドポイント
	•	GET /.well-known/oauth-protected-resource
例:

{
  "resource": "https://hatago.example.com/mcp",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["hatago.read", "hatago.write"]
}

	•	resource はMCPサーバーの正規URI（Resource Indicators の対象）。クライアントは resource=<MCP URI> を必ず付与してトークンを取得する。 ￼

	•	未認証で /mcp に来たら 401 + WWW-Authenticate を返し、リソースメタデータURLを示す。 ￼

4.3 実装メモ
	•	受信トークン検証
	•	Authorization: Bearer <token> を毎リクエスト要求。Audience（resource）検証を必ず行う。トークンパススルー禁止。 ￼
	•	PKCE
	•	code_challenge_methods_supported をメタデータで確認できないASは拒否。 ￼

⸻

5. HTTP / セキュリティ
	•	CORS/Origin
	•	Origin ヘッダを必ず検証（DNS Rebinding対策）。ローカル運用時は 127.0.0.1 のみでバインド推奨。 ￼
	•	パス
	•	ALL /mcp（POST/GET）
	•	GET /.well-known/oauth-protected-resource（OAuthプラグインが提供）
	•	GET /healthz（任意）
	•	セッション
	•	必要なら Mcp-Session-Id を払い出し、以降必須化。セッション破棄は DELETE /mcp + ヘッダ。 ￼
	•	ロギング
	•	MCPの構造化ログ通知に対応（クライアントへ通知可能）。サーバー内部ログはJSONで標準出力。 ￼

⸻

6. 実装スケッチ（TypeScript）

6.1 コア（Hono × @hono/mcp × MCP SDK）

// apps/hatago/src/server.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport as HonoTransport } from '@hono/mcp' // Hono向け
// プラグイン読み込み（動的import）
import { loadPlugins } from './system/plugins'

export const app = new Hono()

// セキュリティ(CORS+Origin制限は環境で切替)
app.use('*', cors({ origin: (origin) => allowOrigin(origin) }))

// MCPサーバ本体
const mcp = new McpServer({ name: 'hatago', version: '0.1.0' })

// プラグイン適用（tools/resources/http routes etc.）
await loadPlugins({ app, mcp })

// MCP endpoint（POST/GET/SSE自動）
app.all('/mcp', async (c) => {
  const transport = new HonoTransport({ /* 将来: sessionIdGenerator, dnsRebindingProtection */ })
  await mcp.connect(transport)
  return transport.handleRequest(c)
})

export default app

@hono/mcp の用法は公開ドキュメント通り。Cloudflare / Node / Deno / Bun で動く。 ￼
MCP TS SDK のサーバー生成と Streamable HTTP 連携は公式READMEの流儀に沿う。 ￼

6.2 PoC: 「Hello Hatago」ストリーミング・ツール

MCPはツールの最終レスポンスは一発だが、途中経過は進捗通知で流せる。クライアントが _meta.progressToken をくれた時だけ送る。 ￼

// plugins/hello-hatago.ts
import type { HatagoPlugin } from '../system/types'
import { z } from 'zod'

export default {
  name: 'hello-hatago',
  version: '0.1.0',
  setup: ({ mcp }) => {
    mcp.registerTool(
      'hello_hatago',
      {
        title: 'Hello Hatago',
        description: 'ストリーミングで挨拶するだけの魔法',
        inputSchema: { name: z.string().optional() }
      },
      async (args, ctx) => {
        const who = args.name ?? 'Hatago'
        const text = `Hello ${who}`

        // 進捗通知が有効なら、1文字ずつ流す
        if (ctx.progress) {
          for (let i = 1; i <= text.length; i++) {
            await ctx.progress({
              progress: i,
              total: text.length,
              message: text.slice(0, i)
            })
            await new Promise(r => setTimeout(r, 30))
          }
        }

        return {
          content: [{ type: 'text', text }]
        }
      }
    )
  }
} satisfies HatagoPlugin

6.3 OAuth プラグイン（Protected Resource Metadata + 401 Challenge）

// plugins/oauth-metadata.ts
import type { HatagoPlugin } from '../system/types'
import { HTTPException } from 'hono/http-exception'

export default {
  name: 'oauth-metadata',
  version: '0.1.0',
  http: (app) => {
    app.get('/.well-known/oauth-protected-resource', (c) => {
      return c.json({
        resource: `${new URL('/mcp', c.req.url).origin}/mcp`,
        authorization_servers: ['https://auth.example.com'],
        scopes_supported: ['hatago.read', 'hatago.write']
      })
    })
  },
  setup: ({ app }) => {
    // 未認証アクセスの例（実運用は細かく条件分岐）
    app.use('/mcp', async (c, next) => {
      const authz = c.req.header('authorization') || ''
      if (!authz.startsWith('Bearer ')) {
        // RFC9728に沿ってメタデータ場所を伝える
        c.header(
          'WWW-Authenticate',
          `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource', c.req.url).toString()}"`
        )
        throw new HTTPException(401)
      }
      await next()
    })
  }
} satisfies HatagoPlugin

RFC 9728 の Protected Resource Metadata と WWW-Authenticate を実装。MCPドラフトも **「MUST 実装」**としている。 ￼ ￼

⸻

7. 設定ファイル（例）

// hatago.config.ts
export default {
  plugins: [
    './plugins/oauth-metadata.ts',
    './plugins/hello-hatago.ts',
    // './plugins/upstream-github.ts' みたいに下流MCPを足していく
  ],
  security: {
    allowedOrigins: ['https://claude.ai', 'http://127.0.0.1:PORT']
  },
  http: {
    path: '/mcp'
  }
}


⸻

8. ランタイム互換性

目標環境	ポイント
Cloudflare Workers	fetch/Web Streams のみで実装。Hono/@hono/mcp はWorkers対応。 ￼
Node 18+	ESM、undiciベース。MCP SDK要件もNode 18+。 ￼
Deno / Bun	ESM動的import前提でOK。Hono対応。 ￼


⸻

9. セキュリティ実装チェックリスト
	•	Origin 検証（固定ホワイトリスト）と Vary: Origin
	•	Mcp-Session-Id の発行・検証（必要時）
	•	401時に WWW-Authenticate + resource metadata を返す
	•	Audience（resource）検証／トークンのパススルー禁止（上流APIへ別トークンで出る） ￼
	•	PKCE(S256) 必須・メタデータで対応可否チェック  ￼

⸻

10. 観測性
	•	MCPログ通知（notifications/log）でクライアントに重要イベントを送る。 ￼
	•	HTTPアクセスログはJSON行。将来は /metrics（Prometheus 互換）を追加してもいい……別に義務じゃないけど。

⸻

11. PoC 検証手順（最短）
	1.	hatago 起動（Node or Workers）
	2.	MCP Inspector / Claude Desktop / OpenAI Agents SDK などMCP対応クライアントで POST /mcp に initialize → tools/list で hello_hatago を確認。
	3.	tools/call に _meta.progressToken を付与して呼ぶと、進捗通知が流れる。 ￼
	4.	未認証で叩いて 401 + WWW-Authenticate と /.well-known/oauth-protected-resource が動いていることを確認。 ￼

⸻

12. ロードマップ
	•	v0.1-PoC
	•	コア（Hono + @hono/mcp + MCP SDK）
	•	Hello Hatago ツール（progress通知つき）
	•	OAuthプラグイン（PRM + 401チャレンジ）
	•	v0.2
	•	Upstream MCP アダプタ（名前空間マウント、tools/list キャッシュ、tools/call 転送）
	•	セッション管理（Mcp-Session-Id）と中断/再開サポート
	•	v0.3
	•	旧SSE互換の受け口（必要なら）とBack-compat
	•	クライアント差異に合わせたprogressフォールバック（ログ通知へ降格 など）
	•	ベンチとサイズ最適化

⸻

13. 既知の相互運用の癖
	•	クライアントの progressToken 対応が未成熟なことがある……場合によってはログ通知で代替。 ￼ ￼
	•	@hono/mcp の認可サポートは進行中の議論もあり、当面はプラグイン側でPRM/401処理を持つのが安全。 ￼

⸻

14. 参考（一次情報）
	•	Transports / Streamable HTTP（AcceptやSSE、セッション、Origin対策） ￼
	•	Lifecycle（initialize / initialized）  ￼
	•	Tools / tools/call  ￼
	•	Progress（_meta.progressToken / notifications/progress）  ￼
	•	Authorization（OAuth 2.1 + PKCE / PRM / WWW-Authenticate）  ￼
	•	Hono MCP ミドルウェア（StreamableHTTPTransport / マルチランタイム） ￼
	•	MCP TS SDK（Streamable HTTP、CORS/Sessionのノートを含む） ￼
	•	Hono（Web標準/軽量） ￼

⸻

……こんなところかな。
PoCは今日中に動くはず。進めるなら、P: ひな型リポジトリを作る → P: hello プラグインを登録 → P: OAuthプラグインで PRM と 401。