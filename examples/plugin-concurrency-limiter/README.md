# Concurrency Limiter Plugin Example

サーキットブレーカーとキューイング機能を備えた同時実行制御プラグインの関数型実装例。リデューサーパターンによる状態管理。

## 概要

このプラグインは：

- 同時実行数の制限とキューイング
- サーキットブレーカーパターンの実装
- 関数型リデューサーによる状態管理
- タイムアウトとリトライ制御
- リクエスト優先度の管理

## 実行方法

```bash
# 基本実行（デフォルト：5並行、キュー10）
pnpm ex --plugin concurrency-limiter --mode smoke

# 設定をカスタマイズ
MAX_CONCURRENT=3 QUEUE_SIZE=5 pnpm ex --plugin concurrency-limiter --mode full

# サーキットブレーカーテスト
CIRCUIT_FAILURE_THRESHOLD=3 pnpm ex --plugin concurrency-limiter --mode smoke
```

## 期待される動作

### 通常の並行制御

```
✅ SUCCESS (150ms)
Concurrency limiter initialized: 5 slots, queue size 10

Request 1: ✅ Slot acquired (4 remaining)
Request 2: ✅ Slot acquired (3 remaining)
Request 3: ✅ Slot acquired (2 remaining)
Request 4: ✅ Slot acquired (1 remaining)
Request 5: ✅ Slot acquired (0 remaining)
Request 6: ⏳ Queued (position 1)
Request 7: ⏳ Queued (position 2)
```

### サーキットブレーカー動作

```
Circuit state: CLOSED
Error rate: 20% (2/10 requests)
Error rate: 40% (4/10 requests)
⚠️  Circuit state: OPEN (cooling down)

Request 8: ❌ Circuit open (retry after 30s)
Request 9: ❌ Circuit open (retry after 25s)

30 seconds later...
Circuit state: HALF_OPEN (testing)
Request 10: ✅ Test request successful
Circuit state: CLOSED (recovered)
```

## アルゴリズムの説明

### 同時実行制御

1. **スロット管理**: 設定された数のスロットでリクエスト処理
2. **キューイング**: スロット満杯時はキューで待機
3. **FIFO処理**: 先入先出でキューからスロット割り当て
4. **タイムアウト**: 設定時間でキュー待ちを打ち切り

### サーキットブレーカー

```typescript
// サーキット状態の定義
enum CircuitState {
  CLOSED = 'closed', // 正常動作
  OPEN = 'open', // 障害検知で遮断
  HALF_OPEN = 'half_open', // 回復テスト中
}

// 状態遷移ロジック（純粋関数）
const shouldOpenCircuit = (stats: CircuitStats): boolean => {
  return stats.errorRate > config.failureThreshold && stats.totalRequests >= config.minimumRequests
}
```

### 関数型リデューサーパターン

```typescript
// アクション定義
type LimiterAction =
  | { type: 'ACQUIRE_SLOT'; requestId: string; priority?: number }
  | { type: 'RELEASE_SLOT'; requestId: string; success: boolean }
  | { type: 'ADD_TO_QUEUE'; requestId: string; priority?: number }
  | { type: 'TIMEOUT_REQUEST'; requestId: string }
  | { type: 'RESET_CIRCUIT' }

// 状態更新（純粋関数）
const limiterReducer = (state: LimiterState, action: LimiterAction): LimiterState => {
  switch (action.type) {
    case 'ACQUIRE_SLOT':
      return acquireSlot(state, action.requestId, action.priority)
    case 'RELEASE_SLOT':
      return releaseSlot(state, action.requestId, action.success)
    // ...
  }
}
```

## MCPツール

### `concurrency_status`

現在の同時実行状態を取得

```typescript
{
  "includeQueue": true,     // キュー情報を含める
  "includeCircuit": true,   // サーキット情報を含める
  "includeMetrics": true    // メトリクス情報を含める
}
```

**レスポンス例：**

```json
{
  "activeSlots": 3,
  "totalSlots": 5,
  "queueLength": 2,
  "circuitState": "closed",
  "metrics": {
    "totalRequests": 156,
    "successfulRequests": 142,
    "failedRequests": 14,
    "averageResponseTime": 250,
    "errorRate": 0.09
  },
  "queue": [
    { "id": "req-123", "priority": 1, "queuedAt": "2024-01-01T00:00:10.000Z" },
    { "id": "req-124", "priority": 0, "queuedAt": "2024-01-01T00:00:12.000Z" }
  ]
}
```

### `concurrency_config`

同時実行制御の設定管理

```typescript
{
  "action": "get" | "set",
  "config": {
    "maxConcurrent": 10,        // 最大同時実行数
    "queueSize": 20,           // キューサイズ
    "timeoutMs": 30000,        // タイムアウト時間
    "circuitBreakerConfig": {
      "failureThreshold": 0.5,  // エラー率閾値
      "minimumRequests": 10,    // 最小リクエスト数
      "cooldownMs": 30000       // クールダウン時間
    }
  }
}
```

### `concurrency_reset`

状態のリセット

```typescript
{
  "scope": "circuit" | "queue" | "all",  // リセット範囲
  "reason": "maintenance"                // リセット理由
}
```

### `concurrency_simulate`

負荷テスト用シミュレーション

```typescript
{
  "requests": 20,            // リクエスト数
  "concurrency": 8,          // 並行度
  "failureRate": 0.1,        // 失敗率
  "requestDurationMs": 1000   // リクエスト時間
}
```

## 実装パターン

### リデューサーベース状態管理

```typescript
// 不変な状態構造
interface LimiterState {
  readonly activeSlots: ReadonlyMap<string, RequestEntry>
  readonly queue: ReadonlyArray<QueuedRequest>
  readonly circuitState: CircuitState
  readonly circuitStats: CircuitStats
  readonly metrics: RequestMetrics
}

// 状態更新（常に新しいオブジェクトを返す）
const acquireSlot = (state: LimiterState, requestId: string, priority = 0): LimiterState => {
  if (state.activeSlots.size >= config.maxConcurrent) {
    return addToQueue(state, requestId, priority)
  }

  const newActiveSlots = new Map(state.activeSlots)
  newActiveSlots.set(requestId, {
    id: requestId,
    startTime: Date.now(),
    priority,
  })

  return {
    ...state,
    activeSlots: newActiveSlots,
  }
}
```

### サーキットブレーカー実装

```typescript
// サーキット状態の判定（純粋関数）
const evaluateCircuitState = (
  currentState: CircuitState,
  stats: CircuitStats,
  config: CircuitConfig
): CircuitState => {
  switch (currentState) {
    case CircuitState.CLOSED:
      return shouldOpenCircuit(stats, config) ? CircuitState.OPEN : CircuitState.CLOSED

    case CircuitState.OPEN:
      return shouldTransitionToHalfOpen(stats, config) ? CircuitState.HALF_OPEN : CircuitState.OPEN

    case CircuitState.HALF_OPEN:
      return stats.recentSuccess ? CircuitState.CLOSED : CircuitState.OPEN
  }
}
```

### 優先度付きキューイング

```typescript
// 優先度順でのキュー挿入（純粋関数）
const insertByPriority = (
  queue: ReadonlyArray<QueuedRequest>,
  request: QueuedRequest
): ReadonlyArray<QueuedRequest> => {
  const insertIndex = queue.findIndex(q => q.priority < request.priority)

  if (insertIndex === -1) {
    return [...queue, request]
  }

  return [...queue.slice(0, insertIndex), request, ...queue.slice(insertIndex)]
}
```

### ミドルウェア統合

```typescript
// 同時実行制御ミドルウェア
const concurrencyMiddleware = (limiter: ConcurrencyLimiter) => async (c: Context, next: Next) => {
  const requestId = generateRequestId()
  const priority = extractPriority(c.req)

  try {
    // スロット取得を試行
    const acquired = await limiter.acquireSlot(requestId, priority)

    if (!acquired) {
      return c.json(
        {
          error: 'Service unavailable',
          retryAfter: limiter.getRetryAfter(),
        },
        503
      )
    }

    // リクエスト処理
    const startTime = Date.now()
    await next()
    const duration = Date.now() - startTime

    // 成功として記録
    limiter.releaseSlot(requestId, true, duration)
  } catch (error) {
    // 失敗として記録
    limiter.releaseSlot(requestId, false)
    throw error
  }
}
```

## テスト戦略

### 並行実行シミュレーション

```typescript
// 並行リクエストのテスト
it('should handle concurrent requests correctly', async () => {
  const concurrentRequests = Array.from({ length: 10 }, (_, i) => limiter.acquireSlot(`req-${i}`))

  const results = await Promise.allSettled(concurrentRequests)

  const acquired = results.filter(r => r.status === 'fulfilled' && r.value === true)
  const queued = results.filter(r => r.status === 'fulfilled' && r.value === false)

  expect(acquired.length).toBeLessThanOrEqual(maxConcurrent)
  expect(queued.length).toBe(Math.max(0, 10 - maxConcurrent))
})
```

### サーキットブレーカーテスト

```typescript
// サーキット開放のテスト
it('should open circuit after threshold failures', async () => {
  // 失敗リクエストを送信
  for (let i = 0; i < 10; i++) {
    await limiter.acquireSlot(`fail-${i}`)
    limiter.releaseSlot(`fail-${i}`, false) // 失敗として記録
  }

  // サーキットが開放されることを確認
  expect(limiter.getCircuitState()).toBe('open')

  // 新しいリクエストが拒否されることを確認
  const shouldBeRejected = await limiter.acquireSlot('test')
  expect(shouldBeRejected).toBe(false)
})
```

### タイムアウトテスト

```typescript
// キュータイムアウトのテスト
it('should timeout queued requests', async () => {
  vi.useFakeTimers()

  // キューを満杯にする
  await fillQueue(limiter)

  // タイムアウト時間を進める
  vi.advanceTimersByTime(timeoutMs + 1000)

  // キューがクリアされることを確認
  const status = await limiter.getStatus()
  expect(status.queueLength).toBe(0)
})
```

## 設定オプション

### 環境変数

- `MAX_CONCURRENT`: 最大同時実行数（デフォルト: 5）
- `QUEUE_SIZE`: キューサイズ（デフォルト: 10）
- `TIMEOUT_MS`: タイムアウト時間（デフォルト: 30000）
- `CIRCUIT_FAILURE_THRESHOLD`: エラー率閾値（デフォルト: 0.5）
- `CIRCUIT_COOLDOWN_MS`: クールダウン時間（デフォルト: 30000）

### プラグイン設定

```typescript
const concurrencyPlugin = createConcurrencyLimiterPlugin({
  maxConcurrent: 10,
  queueSize: 50,
  timeoutMs: 60000,
  circuitBreaker: {
    failureThreshold: 0.3,
    minimumRequests: 20,
    cooldownMs: 60000,
    halfOpenMaxRequests: 5,
  },
  priority: {
    enablePriorityQueue: true,
    defaultPriority: 0,
    maxPriority: 10,
  },
  metrics: {
    enableDetailedMetrics: true,
    metricsRetentionMs: 300000,
  },
})
```

## 学習ポイント

1. **リデューサーパターン**: 複雑な状態変更を純粋関数で管理
2. **サーキットブレーカー**: 障害の伝播を防ぐ設計パターン
3. **キューイング**: 優先度付きの待ち行列管理
4. **不変性**: 並行処理における安全な状態管理
5. **ミドルウェア**: 横断的関心事の実装パターン
