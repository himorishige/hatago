/**
 * Concurrency Limiter Plugin Example - 関数型サーキットブレーカー実装
 *
 * リデューサーパターンによる並行制御とサーキットブレーカー
 * 不変状態管理による安全な並行処理
 */

import type { HatagoPlugin } from '@hatago/core'
import type { ExampleConfig, TestScenario } from '../_shared/types.js'

// ===== 型定義（不変データ構造） =====

/**
 * サーキット状態の列挙型
 */
enum CircuitState {
  CLOSED = 'closed', // 正常動作
  OPEN = 'open', // 障害検知で遮断
  HALF_OPEN = 'half_open', // 回復テスト中
}

/**
 * リクエストエントリ（実行中）
 */
interface RequestEntry {
  readonly id: string
  readonly startTime: number
  readonly priority: number
  readonly timeoutId?: NodeJS.Timeout
}

/**
 * キューエントリ（待機中）
 */
interface QueuedRequest {
  readonly id: string
  readonly priority: number
  readonly queuedAt: number
  readonly timeoutId?: NodeJS.Timeout
}

/**
 * サーキット統計情報
 */
interface CircuitStats {
  readonly totalRequests: number
  readonly successfulRequests: number
  readonly failedRequests: number
  readonly recentRequests: readonly boolean[] // 最近のリクエスト結果
  readonly lastFailureTime: number
  readonly consecutiveFailures: number
}

/**
 * パフォーマンスメトリクス
 */
interface RequestMetrics {
  readonly averageResponseTime: number
  readonly p95ResponseTime: number
  readonly requestsPerSecond: number
  readonly responseTimes: readonly number[]
}

/**
 * リミッター状態（完全に不変）
 */
interface LimiterState {
  readonly activeSlots: ReadonlyMap<string, RequestEntry>
  readonly queue: readonly QueuedRequest[]
  readonly circuitState: CircuitState
  readonly circuitStats: CircuitStats
  readonly metrics: RequestMetrics
  readonly config: ConcurrencyConfig
}

/**
 * 同時実行制御設定
 */
interface ConcurrencyConfig {
  readonly maxConcurrent: number
  readonly queueSize: number
  readonly timeoutMs: number
  readonly circuitBreaker: CircuitBreakerConfig
  readonly enableMetrics: boolean
  readonly enablePriorityQueue: boolean
}

/**
 * サーキットブレーカー設定
 */
interface CircuitBreakerConfig {
  readonly failureThreshold: number // エラー率閾値 (0.0-1.0)
  readonly minimumRequests: number // 最小リクエスト数
  readonly cooldownMs: number // クールダウン時間
  readonly halfOpenMaxRequests: number // ハーフオープン時の最大テスト数
}

/**
 * アクション定義（Reduxパターン）
 */
type LimiterAction =
  | { type: 'ACQUIRE_SLOT'; requestId: string; priority?: number }
  | { type: 'RELEASE_SLOT'; requestId: string; success: boolean; duration?: number }
  | { type: 'ADD_TO_QUEUE'; requestId: string; priority?: number }
  | { type: 'REMOVE_FROM_QUEUE'; requestId: string }
  | { type: 'TIMEOUT_REQUEST'; requestId: string }
  | { type: 'RESET_CIRCUIT'; reason?: string }
  | { type: 'UPDATE_METRICS'; responseTime: number }

/**
 * スロット取得結果
 */
interface AcquisitionResult {
  readonly acquired: boolean
  readonly queued: boolean
  readonly reason: string
  readonly retryAfter?: number
}

// ===== 純粋関数群 =====

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: ConcurrencyConfig = {
  maxConcurrent: 5,
  queueSize: 10,
  timeoutMs: 30000,
  circuitBreaker: {
    failureThreshold: 0.5,
    minimumRequests: 10,
    cooldownMs: 30000,
    halfOpenMaxRequests: 3,
  },
  enableMetrics: true,
  enablePriorityQueue: true,
} as const

/**
 * 環境変数からの設定読み込み（純粋関数）
 */
const loadConfigFromEnv = (env: Record<string, string | undefined>): Partial<ConcurrencyConfig> => {
  return {
    maxConcurrent: env.MAX_CONCURRENT ? Number.parseInt(env.MAX_CONCURRENT, 10) : undefined,
    queueSize: env.QUEUE_SIZE ? Number.parseInt(env.QUEUE_SIZE, 10) : undefined,
    timeoutMs: env.TIMEOUT_MS ? Number.parseInt(env.TIMEOUT_MS, 10) : undefined,
    circuitBreaker: {
      failureThreshold: env.CIRCUIT_FAILURE_THRESHOLD
        ? Number.parseFloat(env.CIRCUIT_FAILURE_THRESHOLD)
        : undefined,
      cooldownMs: env.CIRCUIT_COOLDOWN_MS
        ? Number.parseInt(env.CIRCUIT_COOLDOWN_MS, 10)
        : undefined,
      minimumRequests: env.CIRCUIT_MIN_REQUESTS
        ? Number.parseInt(env.CIRCUIT_MIN_REQUESTS, 10)
        : undefined,
      halfOpenMaxRequests: env.CIRCUIT_HALF_OPEN_MAX
        ? Number.parseInt(env.CIRCUIT_HALF_OPEN_MAX, 10)
        : undefined,
    },
  }
}

/**
 * 初期状態の作成（純粋関数）
 */
const createInitialState = (config: ConcurrencyConfig): LimiterState => ({
  activeSlots: new Map(),
  queue: [],
  circuitState: CircuitState.CLOSED,
  circuitStats: {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    recentRequests: [],
    lastFailureTime: 0,
    consecutiveFailures: 0,
  },
  metrics: {
    averageResponseTime: 0,
    p95ResponseTime: 0,
    requestsPerSecond: 0,
    responseTimes: [],
  },
  config,
})

/**
 * スロット取得可能性の判定（純粋関数）
 */
const canAcquireSlot = (state: LimiterState): boolean => {
  return state.activeSlots.size < state.config.maxConcurrent
}

/**
 * キュー満杯判定（純粋関数）
 */
const isQueueFull = (state: LimiterState): boolean => {
  return state.queue.length >= state.config.queueSize
}

/**
 * サーキット開放判定（純粋関数）
 */
const shouldOpenCircuit = (stats: CircuitStats, config: CircuitBreakerConfig): boolean => {
  if (stats.totalRequests < config.minimumRequests) {
    return false
  }

  const errorRate = stats.failedRequests / stats.totalRequests
  return errorRate >= config.failureThreshold
}

/**
 * ハーフオープン遷移判定（純粋関数）
 */
const shouldTransitionToHalfOpen = (
  stats: CircuitStats,
  config: CircuitBreakerConfig,
  now: number
): boolean => {
  const cooldownElapsed = now - stats.lastFailureTime
  return cooldownElapsed >= config.cooldownMs
}

/**
 * サーキット状態評価（純粋関数）
 */
const isCircuitCurrentlyOpen = (state: LimiterState, now: number): boolean => {
  const { circuitState, circuitStats, config } = state

  switch (circuitState) {
    case CircuitState.CLOSED:
      return shouldOpenCircuit(circuitStats, config.circuitBreaker)

    case CircuitState.OPEN:
      return !shouldTransitionToHalfOpen(circuitStats, config.circuitBreaker, now)

    case CircuitState.HALF_OPEN:
      // ハーフオープン中は部分的に開放
      return false
  }
}

/**
 * 優先度順でのキュー挿入（純粋関数）
 */
const insertByPriority = (
  queue: readonly QueuedRequest[],
  request: QueuedRequest
): readonly QueuedRequest[] => {
  if (!queue.length) {
    return [request]
  }

  // 優先度の高い順で挿入位置を決定
  const insertIndex = queue.findIndex(q => q.priority < request.priority)

  if (insertIndex === -1) {
    return [...queue, request]
  }

  return [...queue.slice(0, insertIndex), request, ...queue.slice(insertIndex)]
}

/**
 * キューからのリクエスト削除（純粋関数）
 */
const removeFromQueue = (
  queue: readonly QueuedRequest[],
  requestId: string
): readonly QueuedRequest[] => {
  return queue.filter(req => req.id !== requestId)
}

/**
 * 統計情報の更新（純粋関数）
 */
const updateCircuitStats = (stats: CircuitStats, success: boolean, now: number): CircuitStats => {
  const recentLimit = 100 // 最近100件のリクエストを保持
  const newRecentRequests = [...stats.recentRequests, success].slice(-recentLimit)

  return {
    totalRequests: stats.totalRequests + 1,
    successfulRequests: stats.successfulRequests + (success ? 1 : 0),
    failedRequests: stats.failedRequests + (success ? 0 : 1),
    recentRequests: newRecentRequests,
    lastFailureTime: success ? stats.lastFailureTime : now,
    consecutiveFailures: success ? 0 : stats.consecutiveFailures + 1,
  }
}

/**
 * メトリクスの更新（純粋関数）
 */
const updateMetrics = (metrics: RequestMetrics, responseTime: number): RequestMetrics => {
  const newResponseTimes = [...metrics.responseTimes, responseTime].slice(-1000) // 最新1000件
  const average = newResponseTimes.reduce((sum, time) => sum + time, 0) / newResponseTimes.length
  const sorted = [...newResponseTimes].sort((a, b) => a - b)
  const p95Index = Math.floor(sorted.length * 0.95)
  const p95 = sorted[p95Index] || 0

  return {
    averageResponseTime: average,
    p95ResponseTime: p95,
    requestsPerSecond: calculateRPS(newResponseTimes),
    responseTimes: newResponseTimes,
  }
}

/**
 * RPS計算（純粋関数）
 */
const calculateRPS = (responseTimes: readonly number[]): number => {
  if (responseTimes.length < 2) return 0

  const now = Date.now()
  const oneSecondAgo = now - 1000
  const recentCount = responseTimes.filter(time => time > oneSecondAgo).length

  return recentCount
}

// ===== リデューサー実装 =====

/**
 * メインリデューサー（純粋関数）
 */
const limiterReducer = (state: LimiterState, action: LimiterAction): LimiterState => {
  switch (action.type) {
    case 'ACQUIRE_SLOT':
      return acquireSlot(state, action.requestId, action.priority || 0)

    case 'RELEASE_SLOT':
      return releaseSlot(state, action.requestId, action.success, action.duration)

    case 'ADD_TO_QUEUE':
      return addToQueue(state, action.requestId, action.priority || 0)

    case 'REMOVE_FROM_QUEUE':
      return {
        ...state,
        queue: removeFromQueue(state.queue, action.requestId),
      }

    case 'TIMEOUT_REQUEST':
      return timeoutRequest(state, action.requestId)

    case 'RESET_CIRCUIT':
      return resetCircuit(state)

    case 'UPDATE_METRICS':
      return {
        ...state,
        metrics: updateMetrics(state.metrics, action.responseTime),
      }

    default:
      return state
  }
}

/**
 * スロット取得処理（純粋関数）
 */
const acquireSlot = (state: LimiterState, requestId: string, priority: number): LimiterState => {
  // サーキット開放チェック
  if (isCircuitCurrentlyOpen(state, Date.now())) {
    return state // 取得拒否
  }

  // スロット利用可能性チェック
  if (!canAcquireSlot(state)) {
    return addToQueue(state, requestId, priority)
  }

  // スロット取得
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

/**
 * スロット解放処理（純粋関数）
 */
const releaseSlot = (
  state: LimiterState,
  requestId: string,
  success: boolean,
  duration?: number
): LimiterState => {
  const entry = state.activeSlots.get(requestId)
  if (!entry) {
    return state // 該当リクエストなし
  }

  // スロットから削除
  const newActiveSlots = new Map(state.activeSlots)
  newActiveSlots.delete(requestId)

  // 統計更新
  const now = Date.now()
  const actualDuration = duration || now - entry.startTime
  const newStats = updateCircuitStats(state.circuitStats, success, now)
  const newMetrics = state.config.enableMetrics
    ? updateMetrics(state.metrics, actualDuration)
    : state.metrics

  // サーキット状態評価
  let newCircuitState = state.circuitState
  if (state.circuitState === CircuitState.HALF_OPEN) {
    // ハーフオープン中のテスト結果に基づく状態遷移
    newCircuitState = success ? CircuitState.CLOSED : CircuitState.OPEN
  } else if (shouldOpenCircuit(newStats, state.config.circuitBreaker)) {
    newCircuitState = CircuitState.OPEN
  }

  // キューから次のリクエストを処理
  let newQueue = state.queue
  if (newQueue.length > 0 && canAcquireSlot({ ...state, activeSlots: newActiveSlots })) {
    const nextRequest = newQueue[0]
    newQueue = newQueue.slice(1)
    newActiveSlots.set(nextRequest.id, {
      id: nextRequest.id,
      startTime: Date.now(),
      priority: nextRequest.priority,
    })
  }

  return {
    ...state,
    activeSlots: newActiveSlots,
    queue: newQueue,
    circuitState: newCircuitState,
    circuitStats: newStats,
    metrics: newMetrics,
  }
}

/**
 * キュー追加処理（純粋関数）
 */
const addToQueue = (state: LimiterState, requestId: string, priority: number): LimiterState => {
  if (isQueueFull(state)) {
    return state // キュー満杯で追加拒否
  }

  const newRequest: QueuedRequest = {
    id: requestId,
    priority,
    queuedAt: Date.now(),
  }

  const newQueue = state.config.enablePriorityQueue
    ? insertByPriority(state.queue, newRequest)
    : [...state.queue, newRequest]

  return {
    ...state,
    queue: newQueue,
  }
}

/**
 * リクエストタイムアウト処理（純粋関数）
 */
const timeoutRequest = (state: LimiterState, requestId: string): LimiterState => {
  // アクティブスロットから削除
  const newActiveSlots = new Map(state.activeSlots)
  const wasActive = newActiveSlots.delete(requestId)

  // キューから削除
  const newQueue = removeFromQueue(state.queue, requestId)

  // タイムアウトは失敗として記録
  let newStats = state.circuitStats
  if (wasActive) {
    newStats = updateCircuitStats(state.circuitStats, false, Date.now())
  }

  return {
    ...state,
    activeSlots: newActiveSlots,
    queue: newQueue,
    circuitStats: newStats,
  }
}

/**
 * サーキットリセット処理（純粋関数）
 */
const resetCircuit = (state: LimiterState): LimiterState => ({
  ...state,
  circuitState: CircuitState.CLOSED,
  circuitStats: {
    ...state.circuitStats,
    consecutiveFailures: 0,
    lastFailureTime: 0,
  },
})

// ===== 状態管理クラス =====

/**
 * 同時実行制御管理クラス
 */
class ConcurrencyLimiter {
  private state: LimiterState
  private readonly dispatch: (action: LimiterAction) => void

  constructor(config: ConcurrencyConfig) {
    this.state = createInitialState(config)
    this.dispatch = (action: LimiterAction) => {
      this.state = limiterReducer(this.state, action)
    }
  }

  /**
   * スロット取得試行
   */
  async acquireSlot(requestId: string, priority = 0): Promise<AcquisitionResult> {
    const beforeState = this.state

    // サーキット状態チェック
    if (isCircuitCurrentlyOpen(beforeState, Date.now())) {
      const retryAfter = Math.ceil(beforeState.config.circuitBreaker.cooldownMs / 1000)
      return {
        acquired: false,
        queued: false,
        reason: 'Circuit breaker is open',
        retryAfter,
      }
    }

    // スロット取得を試行
    this.dispatch({ type: 'ACQUIRE_SLOT', requestId, priority })

    // 結果判定
    if (this.state.activeSlots.has(requestId)) {
      return {
        acquired: true,
        queued: false,
        reason: 'Slot acquired successfully',
      }
    }

    // キューに追加されたかチェック
    const inQueue = this.state.queue.some(req => req.id === requestId)
    if (inQueue) {
      return {
        acquired: false,
        queued: true,
        reason: 'Added to queue',
      }
    }

    // 拒否された場合
    return {
      acquired: false,
      queued: false,
      reason: 'Queue is full',
    }
  }

  /**
   * スロット解放
   */
  releaseSlot(requestId: string, success: boolean, duration?: number): void {
    this.dispatch({ type: 'RELEASE_SLOT', requestId, success, duration })
  }

  /**
   * 現在の状態取得
   */
  getStatus(): {
    activeSlots: number
    totalSlots: number
    queueLength: number
    circuitState: string
    metrics: RequestMetrics
  } {
    return {
      activeSlots: this.state.activeSlots.size,
      totalSlots: this.state.config.maxConcurrent,
      queueLength: this.state.queue.length,
      circuitState: this.state.circuitState,
      metrics: this.state.metrics,
    }
  }

  /**
   * 詳細状態取得
   */
  getDetailedStatus(): {
    state: LimiterState
    queue: readonly QueuedRequest[]
    activeRequests: readonly RequestEntry[]
  } {
    return {
      state: this.state,
      queue: this.state.queue,
      activeRequests: Array.from(this.state.activeSlots.values()),
    }
  }

  /**
   * 設定リセット
   */
  reset(scope: 'circuit' | 'queue' | 'all' = 'all'): void {
    switch (scope) {
      case 'circuit':
        this.dispatch({ type: 'RESET_CIRCUIT' })
        break
      case 'queue':
        this.state = {
          ...this.state,
          queue: [],
        }
        break
      case 'all':
        this.state = createInitialState(this.state.config)
        break
    }
  }
}

// ===== MCPツール実装 =====

/**
 * 同時実行状態確認ツール
 */
const createConcurrencyStatusTool = (limiter: ConcurrencyLimiter) => async (request: any) => {
  const {
    includeQueue = false,
    includeCircuit = true,
    includeMetrics = true,
  } = request.params.arguments as {
    includeQueue?: boolean
    includeCircuit?: boolean
    includeMetrics?: boolean
  }

  const status = limiter.getStatus()
  const detailed = includeQueue ? limiter.getDetailedStatus() : null

  const response = {
    activeSlots: status.activeSlots,
    totalSlots: status.totalSlots,
    queueLength: status.queueLength,
    ...(includeCircuit && { circuitState: status.circuitState }),
    ...(includeMetrics && { metrics: status.metrics }),
    ...(includeQueue &&
      detailed && {
        queue: detailed.queue.map(req => ({
          id: req.id,
          priority: req.priority,
          queuedAt: new Date(req.queuedAt).toISOString(),
          waitTimeMs: Date.now() - req.queuedAt,
        })),
      }),
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
  }
}

/**
 * 設定管理ツール
 */
const createConcurrencyConfigTool =
  (limiter: ConcurrencyLimiter, updateConfig: (config: Partial<ConcurrencyConfig>) => void) =>
  async (request: any) => {
    const { action, config } = request.params.arguments as {
      action: 'get' | 'set'
      config?: Partial<ConcurrencyConfig>
    }

    if (action === 'get') {
      const currentState = limiter.getDetailedStatus().state
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(currentState.config, null, 2),
          },
        ],
      }
    }

    if (action === 'set' && config) {
      updateConfig(config)
      return {
        content: [
          {
            type: 'text',
            text: 'Configuration updated successfully',
          },
        ],
      }
    }

    throw new Error('Invalid action or missing config')
  }

/**
 * リセットツール
 */
const createConcurrencyResetTool = (limiter: ConcurrencyLimiter) => async (request: any) => {
  const { scope = 'all', reason } = request.params.arguments as {
    scope?: 'circuit' | 'queue' | 'all'
    reason?: string
  }

  limiter.reset(scope)

  return {
    content: [
      {
        type: 'text',
        text: `${scope} has been reset. Reason: ${reason || 'Manual reset'}`,
      },
    ],
  }
}

/**
 * 負荷シミュレーションツール
 */
const createConcurrencySimulateTool = (limiter: ConcurrencyLimiter) => async (request: any) => {
  const {
    requests = 10,
    concurrency: _concurrency = 3,
    failureRate = 0.1,
    requestDurationMs = 1000,
  } = request.params.arguments as {
    requests?: number
    concurrency?: number
    failureRate?: number
    requestDurationMs?: number
  }

  const results: any[] = []

  // 並行リクエストをシミュレート
  const promises = Array.from({ length: requests }, async (_, i) => {
    const requestId = `sim-${i}`
    const startTime = Date.now()

    try {
      const acquisition = await limiter.acquireSlot(requestId)

      if (acquisition.acquired) {
        // リクエスト処理をシミュレート
        await new Promise(resolve => setTimeout(resolve, requestDurationMs))

        // 失敗率に基づいて成功/失敗を決定
        const success = Math.random() > failureRate
        const duration = Date.now() - startTime

        limiter.releaseSlot(requestId, success, duration)

        results.push({
          requestId,
          status: success ? 'success' : 'failed',
          duration,
          acquired: true,
        })
      } else {
        results.push({
          requestId,
          status: 'rejected',
          reason: acquisition.reason,
          acquired: false,
          queued: acquisition.queued,
        })
      }
    } catch (error) {
      results.push({
        requestId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  await Promise.all(promises)

  const summary = {
    totalRequests: requests,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    rejected: results.filter(r => r.status === 'rejected').length,
    errors: results.filter(r => r.status === 'error').length,
    finalStatus: limiter.getStatus(),
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ summary, details: results }, null, 2),
      },
    ],
  }
}

// ===== プラグイン実装 =====

/**
 * 同時実行制御プラグインの作成
 */
export const createConcurrencyLimiterPlugin = (
  userConfig: Partial<ConcurrencyConfig> = {}
): HatagoPlugin => {
  return async ctx => {
    // 設定の合成
    const envConfig = loadConfigFromEnv(ctx.env || {})
    const config: ConcurrencyConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      ...envConfig,
      circuitBreaker: {
        ...DEFAULT_CONFIG.circuitBreaker,
        ...userConfig.circuitBreaker,
        ...envConfig.circuitBreaker,
      },
    }

    // リミッター初期化
    const limiter = new ConcurrencyLimiter(config)

    // 設定更新関数
    const updateConfig = (newConfig: Partial<ConcurrencyConfig>) => {
      // 実際の実装では新しい設定でリミッターを再初期化
      Object.assign(config, newConfig)
    }

    // MCPツール登録
    ctx.server.registerTool(
      'concurrency_status',
      {
        description: 'Get current concurrency limiting status',
        inputSchema: {
          type: 'object',
          properties: {
            includeQueue: {
              type: 'boolean',
              description: 'Include queue information',
              default: false,
            },
            includeCircuit: {
              type: 'boolean',
              description: 'Include circuit breaker information',
              default: true,
            },
            includeMetrics: {
              type: 'boolean',
              description: 'Include performance metrics',
              default: true,
            },
          },
        },
      },
      createConcurrencyStatusTool(limiter)
    )

    ctx.server.registerTool(
      'concurrency_config',
      {
        description: 'Get or update concurrency limiter configuration',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['get', 'set'],
              description: 'Action to perform',
            },
            config: {
              type: 'object',
              properties: {
                maxConcurrent: { type: 'number', minimum: 1 },
                queueSize: { type: 'number', minimum: 0 },
                timeoutMs: { type: 'number', minimum: 1000 },
              },
              description: 'New configuration (for set action)',
            },
          },
          required: ['action'],
        },
      },
      createConcurrencyConfigTool(limiter, updateConfig)
    )

    ctx.server.registerTool(
      'concurrency_reset',
      {
        description: 'Reset concurrency limiter state',
        inputSchema: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['circuit', 'queue', 'all'],
              description: 'Scope of reset',
              default: 'all',
            },
            reason: {
              type: 'string',
              description: 'Reason for reset',
            },
          },
        },
      },
      createConcurrencyResetTool(limiter)
    )

    ctx.server.registerTool(
      'concurrency_simulate',
      {
        description: 'Simulate load testing for concurrency limiter',
        inputSchema: {
          type: 'object',
          properties: {
            requests: {
              type: 'number',
              description: 'Number of requests to simulate',
              default: 10,
              minimum: 1,
              maximum: 100,
            },
            concurrency: {
              type: 'number',
              description: 'Concurrent request level',
              default: 3,
              minimum: 1,
            },
            failureRate: {
              type: 'number',
              description: 'Failure rate (0.0-1.0)',
              default: 0.1,
              minimum: 0,
              maximum: 1,
            },
            requestDurationMs: {
              type: 'number',
              description: 'Simulated request duration',
              default: 1000,
              minimum: 100,
            },
          },
        },
      },
      createConcurrencySimulateTool(limiter)
    )

    // ミドルウェア登録
    ctx.app.use(async (c, next) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const priority = Number.parseInt(c.req.header('x-priority') || '0', 10)

      const acquisition = await limiter.acquireSlot(requestId, priority)

      if (!acquisition.acquired) {
        const retryAfter = acquisition.retryAfter || 30
        c.res.headers.set('Retry-After', retryAfter.toString())

        return c.json(
          {
            error: 'Service unavailable',
            message: acquisition.reason,
            retryAfter,
          },
          503
        )
      }

      try {
        const startTime = Date.now()
        await next()
        const duration = Date.now() - startTime

        limiter.releaseSlot(requestId, true, duration)
      } catch (error) {
        limiter.releaseSlot(requestId, false)
        throw error
      }
    })
  }
}

// ===== テストシナリオ =====

const testScenarios: readonly TestScenario[] = [
  {
    name: 'Get concurrency status',
    input: {},
    expectedOutput: 'activeSlots',
  },
  {
    name: 'Get detailed status with queue',
    input: { includeQueue: true, includeMetrics: true },
    expectedOutput: 'queue',
  },
  {
    name: 'Get configuration',
    input: { action: 'get' },
    expectedOutput: 'maxConcurrent',
  },
  {
    name: 'Update configuration',
    input: {
      action: 'set',
      config: { maxConcurrent: 8, queueSize: 15 },
    },
    expectedOutput: 'updated successfully',
  },
  {
    name: 'Reset circuit breaker',
    input: { scope: 'circuit', reason: 'Test reset' },
    expectedOutput: 'has been reset',
  },
  {
    name: 'Simulate load test',
    input: {
      requests: 5,
      concurrency: 2,
      failureRate: 0.2,
      requestDurationMs: 500,
    },
    expectedOutput: 'totalRequests',
  },
] as const

// ===== 実行設定 =====

const config: ExampleConfig = {
  name: 'concurrency-limiter',
  description: 'Circuit breaker and concurrency control with reducer pattern state management',
  plugin: createConcurrencyLimiterPlugin({
    maxConcurrent: 3,
    queueSize: 5,
    timeoutMs: 15000,
    circuitBreaker: {
      failureThreshold: 0.3,
      minimumRequests: 5,
      cooldownMs: 10000,
      halfOpenMaxRequests: 2,
    },
    enableMetrics: true,
    enablePriorityQueue: true,
  }),
  testScenarios,
  env: {
    MAX_CONCURRENT: '3',
    QUEUE_SIZE: '5',
    CIRCUIT_FAILURE_THRESHOLD: '0.3',
  },
} as const

export default config
