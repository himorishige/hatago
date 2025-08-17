# Logger Plugin Example

構造化ログとPIIマスキング機能を持つロガープラグインの実装例。関数型アプローチでログ処理を構成。

## 概要

このプラグインは：

- 構造化ログ（JSON/Pretty両対応）
- PII（個人識別情報）の自動マスキング
- ログレベルの動的制御
- 関数合成によるログフォーマッター
- ミドルウェアパターンの実装

## 実行方法

```bash
# 基本実行（Prettyログ）
pnpm ex --plugin logger --mode smoke

# JSON形式ログ
LOG_FORMAT=json pnpm ex --plugin logger --mode full

# デバッグレベル
LOG_LEVEL=debug pnpm ex --plugin logger --mode smoke

# PIIマスキング無効
NOREN_MASKING=false pnpm ex --plugin logger --mode smoke
```

## 期待される出力

### Pretty Format（開発用）

```
2024-01-01T00:00:00.000Z [INFO] Plugin initialized
2024-01-01T00:00:00.000Z [INFO] Request processed {
  "method": "GET",
  "path": "/test",
  "userAgent": "***MASKED***",
  "duration": 45
}
```

### JSON Format（本番用）

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "message": "Request processed",
  "data": {
    "method": "GET",
    "path": "/test",
    "userAgent": "***MASKED***",
    "duration": 45
  }
}
```

## プラグイン機能

### ログレベル制御

- `TRACE` - 最も詳細（開発時のみ）
- `DEBUG` - デバッグ情報
- `INFO` - 一般的な情報（デフォルト）
- `WARN` - 警告
- `ERROR` - エラー
- `FATAL` - 致命的エラー

### PIIマスキング機能

自動的に以下の情報をマスクする：

- メールアドレス：`user@example.com` → `***@***.***`
- クレジットカード番号：`4111-1111-1111-1111` → `****-****-****-****`
- APIトークン：`sk_live_abc123...` → `***TOKEN***`
- パスワードフィールド：`password: "secret"` → `password: "***MASKED***"`

### MCPツール

#### `logs_query`

ログクエリツール（フィルタリング機能付き）

```typescript
{
  "level": "error",           // ログレベルでフィルタ
  "since": "2024-01-01",     // 指定日時以降
  "limit": 100,              // 取得件数制限
  "search": "payment"        // キーワード検索
}
```

#### `logs_config`

ログ設定の取得・更新

```typescript
{
  "action": "get" | "set",
  "config": {
    "level": "debug",
    "format": "json",
    "enableMasking": true
  }
}
```

## 実装パターン

### 関数合成による処理パイプライン

```typescript
// ログフォーマッターの合成例
const formatter = compose(
  addTimestamp,
  addLogLevel(config.level),
  config.maskPii ? maskSensitiveData : identity,
  config.format === 'json' ? toJson : toPretty
)
```

### 不変性を保証したログエントリ

```typescript
interface LogEntry {
  readonly timestamp: string
  readonly level: LogLevel
  readonly message: string
  readonly data?: DeepReadonly<Record<string, unknown>>
}
```

### ミドルウェアパターン

```typescript
const logMiddleware = (formatter: LogFormatter) => async (c: Context, next: Next) => {
  const start = Date.now()
  await next()
  const duration = Date.now() - start

  formatter({
    level: 'info',
    message: 'Request processed',
    data: { method: c.req.method, duration },
  })
}
```

## 学習ポイント

1. **関数合成**: 小さな関数を組み合わせた処理パイプライン
2. **不変性**: ログデータの不変性保証
3. **PIIマスキング**: セキュリティを考慮したデータ処理
4. **ミドルウェア**: Honoミドルウェアパターンの実装
5. **環境変数**: 設定の外部化と型安全な読み込み
