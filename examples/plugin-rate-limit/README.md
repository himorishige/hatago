# Rate Limit Plugin Example

トークンバケットアルゴリズムによるレート制限プラグインの関数型実装例。決定的テストとタイムコントロールに重点を置く。

## 概要

このプラグインは：

- トークンバケットアルゴリズムによるレート制限
- 不変データ構造による状態管理
- フェイクタイマーによる決定的テスト
- 純粋関数による状態更新
- ミドルウェアパターンでのHTTP制限

## 実行方法

```bash
# 基本実行（デフォルト：10req/min）
pnpm ex --plugin rate-limit --mode smoke

# レート制限設定をカスタマイズ
RATE_LIMIT_REQUESTS=5 RATE_LIMIT_WINDOW=60 pnpm ex --plugin rate-limit --mode full

# フェイクタイマー使用（テスト用）
FAKE_TIMERS=true pnpm ex --plugin rate-limit --mode smoke
```

## 期待される動作

### 通常の動作

```
✅ SUCCESS (120ms)
Rate limiting enabled: 10 requests per 60 seconds
Token bucket initialized with 10 tokens

Request 1: ✅ Allowed (9 tokens remaining)
Request 2: ✅ Allowed (8 tokens remaining)
...
Request 11: ❌ Rate limited (retry after 60s)
```

### リフィル動作（60秒後）

```
Time advanced: 60 seconds
Tokens refilled: 10 tokens available

Request 12: ✅ Allowed (9 tokens remaining)
```

## アルゴリズムの説明

### トークンバケットアルゴリズム

1. **バケット初期化**: 最大容量分のトークンで開始
2. **リクエスト処理**: 1トークン消費してリクエスト許可
3. **トークン補充**: 設定間隔で1トークンずつ補充
4. **制限発動**: トークン不足時にリクエスト拒否

### 関数型実装の特徴

```typescript
// 不変なトークンバケット状態
interface TokenBucketState {
  readonly tokens: number
  readonly lastRefill: number
  readonly capacity: number
  readonly refillRate: number
}

// 純粋な状態更新関数
const updateBucketState = (state: TokenBucketState, now: number): TokenBucketState => {
  const elapsed = now - state.lastRefill
  const tokensToAdd = Math.floor(elapsed / state.refillRate)

  return {
    ...state,
    tokens: Math.min(state.capacity, state.tokens + tokensToAdd),
    lastRefill: state.lastRefill + tokensToAdd * state.refillRate,
  }
}
```

## MCPツール

### `rate_limit_status`

現在のレート制限状態を取得

```typescript
{
  "bucket": "api",           // バケット名
  "includeHistory": true     // 履歴情報を含める
}
```

**レスポンス例：**

```json
{
  "bucket": "api",
  "tokens": 8,
  "capacity": 10,
  "refillRate": 1000,
  "nextRefill": "2024-01-01T00:01:00.000Z",
  "history": [
    { "timestamp": "2024-01-01T00:00:00.000Z", "action": "consume", "tokens": 9 },
    { "timestamp": "2024-01-01T00:00:30.000Z", "action": "consume", "tokens": 8 }
  ]
}
```

### `rate_limit_config`

レート制限設定の取得・更新

```typescript
{
  "action": "get" | "set",
  "bucket": "api",
  "config": {
    "capacity": 20,          // 最大トークン数
    "refillRate": 60000,     // リフィル間隔（ms）
    "windowMs": 60000        // 時間窓（ms）
  }
}
```

### `rate_limit_reset`

特定バケットのリセット

```typescript
{
  "bucket": "api",           // リセット対象バケット
  "reason": "maintenance"    // リセット理由
}
```

## 実装パターン

### 不変状態管理

```typescript
// 状態更新は常に新しいオブジェクトを返す
const consumeToken = (state: TokenBucketState): TokenBucketState => {
  if (state.tokens <= 0) {
    throw new Error('No tokens available')
  }

  return {
    ...state,
    tokens: state.tokens - 1,
  }
}
```

### 純粋な判定関数

```typescript
// リクエスト許可判定（副作用なし）
const shouldAllowRequest = (state: TokenBucketState, now: number): Decision => {
  const updated = updateBucketState(state, now)

  return {
    allowed: updated.tokens > 0,
    newState: updated,
    retryAfter: updated.tokens > 0 ? 0 : calculateRetryAfter(updated),
  }
}
```

### ミドルウェア適用

```typescript
// HTTPリクエストへの適用
const rateLimitMiddleware = (bucket: TokenBucket) => async (c: Context, next: Next) => {
  const decision = shouldAllowRequest(bucket.getState(), Date.now())

  if (decision.allowed) {
    bucket.setState(decision.newState)
    await next()
  } else {
    return c.json(
      {
        error: 'Rate limit exceeded',
        retryAfter: decision.retryAfter,
      },
      429
    )
  }
}
```

## テスト戦略

### フェイクタイマーによる決定的テスト

```typescript
import { vi } from 'vitest'

// 時間を制御してトークン補充をテスト
it('should refill tokens over time', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

  const bucket = createTokenBucket({ capacity: 10, refillRate: 1000 })

  // 全トークンを消費
  for (let i = 0; i < 10; i++) {
    bucket.consume()
  }

  // 時間を進めてリフィルをシミュレート
  vi.advanceTimersByTime(5000) // 5秒後

  expect(bucket.getTokens()).toBe(5) // 5トークン回復
})
```

### 境界値テスト

```typescript
// バケット容量の境界をテスト
it('should handle bucket overflow correctly', () => {
  const bucket = createTokenBucket({ capacity: 3 })

  // 時間を大幅に進める
  vi.advanceTimersByTime(3600000) // 1時間

  // 容量を超えないことを確認
  expect(bucket.getTokens()).toBe(3)
})
```

### 並行リクエストのシミュレーション

```typescript
// 同時リクエストの処理
it('should handle concurrent requests correctly', async () => {
  const results = await Promise.all([makeRequest(), makeRequest(), makeRequest()])

  const allowed = results.filter(r => r.status === 200)
  const rejected = results.filter(r => r.status === 429)

  expect(allowed.length + rejected.length).toBe(3)
})
```

## 設定オプション

### 環境変数

- `RATE_LIMIT_REQUESTS`: 時間窓あたりのリクエスト数（デフォルト: 10）
- `RATE_LIMIT_WINDOW`: 時間窓の長さ（秒）（デフォルト: 60）
- `RATE_LIMIT_BURST`: バースト許可倍率（デフォルト: 1.5）
- `FAKE_TIMERS`: テスト用タイマー使用（デフォルト: false）

### プラグイン設定

```typescript
const rateLimitPlugin = createRateLimitPlugin({
  defaultBucket: {
    capacity: 100, // 最大100リクエスト
    refillRate: 1000, // 1秒ごとに1トークン
    windowMs: 60000, // 1分間の窓
  },
  buckets: {
    api: { capacity: 50, refillRate: 2000 },
    auth: { capacity: 5, refillRate: 10000 },
  },
  enableMetrics: true, // メトリクス収集
  enableHistory: true, // 履歴記録
})
```

## 学習ポイント

1. **不変性**: 状態変更を新しいオブジェクト作成で表現
2. **純粋関数**: 副作用のない状態更新とロジック
3. **時間制御**: フェイクタイマーによる決定的テスト
4. **アルゴリズム**: トークンバケットの数学的実装
5. **ミドルウェア**: 横断的関心事の分離パターン
