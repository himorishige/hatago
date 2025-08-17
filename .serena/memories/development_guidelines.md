# Hatago 開発ガイドライン

## 設計原則

### コアフィロソフィー

- **Simplicity First**: 最も単純な実行可能解決策を選択
- **Plugin Architecture**: コアを最小限に保ち、プラグインで拡張
- **Security First**: セキュリティを最優先に設計
- **Runtime Agnostic**: 複数の実行環境で動作

### アーキテクチャパターン

- **Layered Architecture**: 責任の明確な分離
- **Dependency Injection**: プラグインによる機能注入
- **Transport Abstraction**: stdio/HTTP両対応
- **Configuration Driven**: 設定による動作制御

## プラグイン開発ガイド

### 基本パターン

```typescript
import type { HatagoPlugin } from '@hatago/core'

export const myPlugin: HatagoPlugin = async ctx => {
  // MCP ツール登録
  ctx.server.registerTool(
    'my_tool',
    {
      description: 'My custom tool',
      inputSchema: {
        /* Zod schema */
      },
    },
    async request => {
      // ツール実装
      return { content: [{ type: 'text', text: 'Result' }] }
    }
  )

  // HTTP エンドポイント登録
  ctx.app.get('/my-endpoint', async c => {
    return c.json({ status: 'ok' })
  })
}
```

### セキュリティベストプラクティス

- 入力値は必ずZodで検証
- PII情報をログに出力しない（Noren自動マスキング活用）
- Bearer token認証を適切に実装
- エラーメッセージで内部情報を漏洩させない

### プラグイン命名規約

- パッケージ名: `@hatago/plugin-*`
- ツール名: snake_case (`my_tool`)
- エクスポート名: camelCase (`myPlugin`)

## MCP開発ガイド

### ツール定義パターン

```typescript
ctx.server.registerTool(
  'tool_name',
  {
    description: '明確で具体的な説明',
    inputSchema: {
      type: 'object',
      properties: {
        param: { type: 'string', description: 'パラメータ説明' },
      },
      required: ['param'],
    },
  },
  async request => {
    // バリデーション
    const { param } = request.params.arguments as { param: string }

    // 処理実装
    return {
      content: [{ type: 'text', text: result }],
      isError: false,
    }
  }
)
```

### プログレス通知対応

```typescript
// プログレス通知付きツール
const progressToken = request.params._meta?.progressToken
if (progressToken) {
  await ctx.server.notification({
    method: 'notifications/progress',
    params: {
      progressToken,
      progress: 50,
      total: 100,
    },
  })
}
```

## セキュリティ実装ガイド

### OAuth 2.1 実装

```typescript
// Bearer token検証例
const authHeader = request.headers.get('Authorization')
if (!authHeader?.startsWith('Bearer ')) {
  return c.json({ error: 'Unauthorized' }, 401)
}

const token = authHeader.slice(7)
// token検証ロジック
```

### PII マスキング

```typescript
import { logger } from '../utils/logger.js'

// 自動的にPII情報をマスキング
logger.info('User request', {
  userId: user.id, // OK
  email: user.email, // 自動マスキング
  request: requestData, // 自動マスキング
})
```

## テスト戦略

### ユニットテスト

- Vitestを使用
- カバレッジ70%以上を目標
- セキュリティ機能は80%以上

### 統合テスト

- 実際のMCPクライアントでテスト
- stdio/HTTP両トランスポートでテスト
- OAuth認証フローのテスト

### パフォーマンステスト

- 起動時間: 2秒以内
- メモリ使用量: 安定
- レスポンス時間: 100ms以内（軽量ツール）

## 環境別設定

### 開発環境

```typescript
export const developmentConfig = {
  logLevel: 'debug',
  logFormat: 'pretty',
  requireAuth: false,
  norenMasking: true,
  transport: 'http',
}
```

### 本番環境

```typescript
export const productionConfig = {
  logLevel: 'info',
  logFormat: 'json',
  requireAuth: true,
  norenMasking: true,
  transport: 'stdio', // Claude Desktop用
}
```

## エラーハンドリング

### エラーレスポンス標準化

```typescript
try {
  // 処理
} catch (error) {
  logger.error('Tool execution failed', { error, toolName })
  return {
    content: [{ type: 'text', text: 'Internal error occurred' }],
    isError: true,
  }
}
```

### セキュリティエラー

```typescript
// 認証エラー
if (!isAuthenticated) {
  return c.json(
    {
      error: 'Authentication required',
      error_description: 'Bearer token must be provided',
    },
    401
  )
}

// 認可エラー
if (!hasPermission) {
  return c.json(
    {
      error: 'Insufficient scope',
      error_description: 'Required scope: mcp:read',
    },
    403
  )
}
```

## パフォーマンス最適化

### 起動時間最適化

- 動的import活用
- 必要な時にプラグイン読み込み
- 設定ファイルの遅延読み込み

### メモリ最適化

- ストリーミング処理活用
- 大きなオブジェクトの適切な破棄
- メモリリーク検出テスト

### レスポンス最適化

- 非同期処理の活用
- 適切なタイムアウト設定
- プログレス通知による体感速度向上

## CI/CD ベストプラクティス

### 品質ゲート

1. リント: `pnpm lint`
2. タイプチェック: `pnpm typecheck`
3. テスト: `pnpm test`
4. ビルド: `pnpm build`
5. セキュリティスキャン

### リリースプロセス

1. Changesetで変更記録
2. バージョンアップ
3. セキュリティ要件確認
4. パフォーマンステスト
5. 本番デプロイ
