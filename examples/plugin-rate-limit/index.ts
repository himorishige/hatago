/**
 * Rate Limit Plugin Example - トークンバケット関数型実装
 *
 * 不変データ構造によるレート制限の実装
 * フェイクタイマーでの決定的テストが可能
 */

import type { HatagoPlugin } from '@hatago/core'
import type { ExampleConfig, TestScenario } from '../_shared/types.js'

// ===== 型定義（不変データ構造） =====

/**
 * トークンバケットの状態（完全に不変）
 */
interface TokenBucketState {
  readonly tokens: number
  readonly capacity: number
  readonly refillRate: number // ms per token
  readonly lastRefill: number
  readonly windowMs: number
}

/**
 * レート制限設定（不変）
 */
interface RateLimitConfig {
  readonly capacity: number
  readonly refillRate: number
  readonly windowMs: number
  readonly enableMetrics: boolean
  readonly enableHistory: boolean
}

/**
 * バケット設定マップ
 */
interface _BucketConfigs {
  readonly [bucketName: string]: RateLimitConfig
}

/**
 * リクエスト判定結果
 */
interface Decision {
  readonly allowed: boolean
  readonly newState: TokenBucketState
  readonly retryAfter: number
  readonly tokensRemaining: number
}

/**
 * レート制限履歴エントリ
 */
interface HistoryEntry {
  readonly timestamp: number
  readonly action: 'consume' | 'refill' | 'reset'
  readonly tokensAfter: number
  readonly clientId?: string
}

/**
 * バケット状態とメタデータ
 */
interface BucketInfo {
  readonly name: string
  readonly state: TokenBucketState
  readonly history: readonly HistoryEntry[]
  readonly config: RateLimitConfig
}

// ===== 純粋関数群 =====

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  capacity: 10,
  refillRate: 6000, // 6 seconds per token (10 tokens per minute)
  windowMs: 60000, // 1 minute window
  enableMetrics: true,
  enableHistory: true,
} as const

/**
 * 環境変数からの設定読み込み（純粋関数）
 */
const loadConfigFromEnv = (env: Record<string, string | undefined>): Partial<RateLimitConfig> => {
  const requests = env.RATE_LIMIT_REQUESTS
    ? Number.parseInt(env.RATE_LIMIT_REQUESTS, 10)
    : undefined
  const window = env.RATE_LIMIT_WINDOW
    ? Number.parseInt(env.RATE_LIMIT_WINDOW, 10) * 1000
    : undefined
  const burst = env.RATE_LIMIT_BURST ? Number.parseFloat(env.RATE_LIMIT_BURST) : 1.0

  return {
    capacity: requests ? Math.floor(requests * burst) : undefined,
    refillRate: requests && window ? Math.floor(window / requests) : undefined,
    windowMs: window,
  }
}

/**
 * 初期バケット状態の作成（純粋関数）
 */
const createInitialState = (config: RateLimitConfig, now: number): TokenBucketState => ({
  tokens: config.capacity,
  capacity: config.capacity,
  refillRate: config.refillRate,
  lastRefill: now,
  windowMs: config.windowMs,
})

/**
 * トークン補充計算（純粋関数）
 */
const calculateRefill = (state: TokenBucketState, now: number): number => {
  const elapsed = now - state.lastRefill
  return Math.floor(elapsed / state.refillRate)
}

/**
 * バケット状態の更新（純粋関数・不変）
 */
const updateBucketState = (state: TokenBucketState, now: number): TokenBucketState => {
  const tokensToAdd = calculateRefill(state, now)

  if (tokensToAdd === 0) {
    return state // 変更なしの場合は同じオブジェクトを返す
  }

  const newTokens = Math.min(state.capacity, state.tokens + tokensToAdd)
  const refillTime = state.lastRefill + tokensToAdd * state.refillRate

  return {
    ...state,
    tokens: newTokens,
    lastRefill: refillTime,
  }
}

/**
 * トークン消費（純粋関数・不変）
 */
const consumeToken = (state: TokenBucketState): TokenBucketState => {
  if (state.tokens <= 0) {
    throw new Error('No tokens available')
  }

  return {
    ...state,
    tokens: state.tokens - 1,
  }
}

/**
 * リトライ時間の計算（純粋関数）
 */
const calculateRetryAfter = (state: TokenBucketState): number => {
  if (state.tokens > 0) return 0
  return Math.ceil(state.refillRate / 1000) // seconds
}

/**
 * リクエスト許可判定（純粋関数）
 */
const shouldAllowRequest = (state: TokenBucketState, now: number): Decision => {
  // まずリフィルを計算
  const refreshed = updateBucketState(state, now)

  if (refreshed.tokens <= 0) {
    return {
      allowed: false,
      newState: refreshed,
      retryAfter: calculateRetryAfter(refreshed),
      tokensRemaining: 0,
    }
  }

  // トークンを消費
  const consumed = consumeToken(refreshed)

  return {
    allowed: true,
    newState: consumed,
    retryAfter: 0,
    tokensRemaining: consumed.tokens,
  }
}

/**
 * 履歴エントリの作成（純粋関数）
 */
const createHistoryEntry = (
  action: HistoryEntry['action'],
  tokensAfter: number,
  timestamp: number,
  clientId?: string
): HistoryEntry => ({
  timestamp,
  action,
  tokensAfter,
  clientId,
})

/**
 * 履歴の追加（純粋関数・配列操作）
 */
const addToHistory = (
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
  maxSize = 100
): readonly HistoryEntry[] => {
  const newHistory = [...history, entry]
  return newHistory.length > maxSize ? newHistory.slice(-maxSize) : newHistory
}

// ===== 状態管理クラス（イミュータブル操作） =====

/**
 * イミュータブルなトークンバケット管理
 */
class ImmutableTokenBucket {
  private state: TokenBucketState
  private history: readonly HistoryEntry[]
  private readonly config: RateLimitConfig
  private readonly name: string

  constructor(name: string, config: RateLimitConfig, now: number) {
    this.name = name
    this.config = config
    this.state = createInitialState(config, now)
    this.history = []
  }

  /**
   * 状態の取得（読み取り専用）
   */
  getState(): Readonly<TokenBucketState> {
    return this.state
  }

  /**
   * 履歴の取得（読み取り専用）
   */
  getHistory(): readonly HistoryEntry[] {
    return this.history
  }

  /**
   * リクエスト処理（不変操作）
   */
  processRequest(now: number, clientId?: string): Decision {
    const decision = shouldAllowRequest(this.state, now)

    // 状態更新
    this.state = decision.newState

    // 履歴記録（設定に応じて）
    if (this.config.enableHistory) {
      const entry = createHistoryEntry(
        decision.allowed ? 'consume' : 'consume',
        decision.tokensRemaining,
        now,
        clientId
      )
      this.history = addToHistory(this.history, entry)
    }

    return decision
  }

  /**
   * 強制リセット
   */
  reset(now: number, _reason?: string): void {
    this.state = createInitialState(this.config, now)

    if (this.config.enableHistory) {
      const entry = createHistoryEntry('reset', this.state.tokens, now)
      this.history = addToHistory(this.history, entry)
    }
  }

  /**
   * バケット情報の取得
   */
  getInfo(): BucketInfo {
    return {
      name: this.name,
      state: this.state,
      history: this.history,
      config: this.config,
    }
  }
}

// ===== MCPツール実装 =====

/**
 * レート制限状態確認ツール
 */
const createRateLimitStatusTool =
  (buckets: Map<string, ImmutableTokenBucket>) => async (request: any) => {
    const { bucket = 'default', includeHistory = false } = request.params.arguments as {
      bucket?: string
      includeHistory?: boolean
    }

    const bucketInstance = buckets.get(bucket)
    if (!bucketInstance) {
      throw new Error(`Bucket '${bucket}' not found`)
    }

    const info = bucketInstance.getInfo()
    const state = info.state

    const response = {
      bucket,
      tokens: state.tokens,
      capacity: state.capacity,
      refillRate: state.refillRate,
      nextRefill: new Date(state.lastRefill + state.refillRate).toISOString(),
      ...(includeHistory && { history: info.history.slice(-10) }), // 最新10件
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
 * レート制限設定管理ツール
 */
const createRateLimitConfigTool =
  (buckets: Map<string, ImmutableTokenBucket>, configs: Map<string, RateLimitConfig>) =>
  async (request: any) => {
    const {
      action,
      bucket = 'default',
      config,
    } = request.params.arguments as {
      action: 'get' | 'set'
      bucket?: string
      config?: Partial<RateLimitConfig>
    }

    if (action === 'get') {
      const bucketConfig = configs.get(bucket)
      if (!bucketConfig) {
        throw new Error(`Bucket '${bucket}' not found`)
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(bucketConfig, null, 2),
          },
        ],
      }
    }

    if (action === 'set' && config) {
      const currentConfig = configs.get(bucket) || DEFAULT_CONFIG
      const newConfig = { ...currentConfig, ...config }

      configs.set(bucket, newConfig)

      // 既存バケットがある場合は新しい設定で再作成
      if (buckets.has(bucket)) {
        buckets.set(bucket, new ImmutableTokenBucket(bucket, newConfig, Date.now()))
      }

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
 * レート制限リセットツール
 */
const createRateLimitResetTool =
  (buckets: Map<string, ImmutableTokenBucket>) => async (request: any) => {
    const { bucket = 'default', reason } = request.params.arguments as {
      bucket?: string
      reason?: string
    }

    const bucketInstance = buckets.get(bucket)
    if (!bucketInstance) {
      throw new Error(`Bucket '${bucket}' not found`)
    }

    bucketInstance.reset(Date.now(), reason)

    return {
      content: [
        {
          type: 'text',
          text: `Bucket '${bucket}' has been reset. Reason: ${reason || 'Manual reset'}`,
        },
      ],
    }
  }

// ===== プラグイン実装 =====

/**
 * レート制限プラグインの作成
 */
export const createRateLimitPlugin = (
  userConfig: {
    readonly defaultBucket?: Partial<RateLimitConfig>
    readonly buckets?: Readonly<Record<string, Partial<RateLimitConfig>>>
    readonly enableMetrics?: boolean
  } = {}
): HatagoPlugin => {
  return async ctx => {
    // 設定の合成
    const envConfig = loadConfigFromEnv(ctx.env || {})
    const defaultConfig: RateLimitConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig.defaultBucket,
      ...envConfig,
    }

    // バケット管理
    const buckets = new Map<string, ImmutableTokenBucket>()
    const configs = new Map<string, RateLimitConfig>()

    // デフォルトバケットの初期化
    configs.set('default', defaultConfig)
    buckets.set('default', new ImmutableTokenBucket('default', defaultConfig, Date.now()))

    // 追加バケットの初期化
    if (userConfig.buckets) {
      Object.entries(userConfig.buckets).forEach(([name, config]) => {
        const bucketConfig = { ...defaultConfig, ...config }
        configs.set(name, bucketConfig)
        buckets.set(name, new ImmutableTokenBucket(name, bucketConfig, Date.now()))
      })
    }

    // MCPツール登録
    ctx.server.registerTool(
      'rate_limit_status',
      {
        description: 'Get current rate limiting status for a bucket',
        inputSchema: {
          type: 'object',
          properties: {
            bucket: {
              type: 'string',
              description: 'Bucket name to check',
              default: 'default',
            },
            includeHistory: {
              type: 'boolean',
              description: 'Include request history in response',
              default: false,
            },
          },
        },
      },
      createRateLimitStatusTool(buckets)
    )

    ctx.server.registerTool(
      'rate_limit_config',
      {
        description: 'Get or update rate limiting configuration',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['get', 'set'],
              description: 'Action to perform',
            },
            bucket: {
              type: 'string',
              description: 'Bucket name',
              default: 'default',
            },
            config: {
              type: 'object',
              properties: {
                capacity: { type: 'number', minimum: 1 },
                refillRate: { type: 'number', minimum: 1 },
                windowMs: { type: 'number', minimum: 1000 },
                enableMetrics: { type: 'boolean' },
                enableHistory: { type: 'boolean' },
              },
              description: 'New configuration (for set action)',
            },
          },
          required: ['action'],
        },
      },
      createRateLimitConfigTool(buckets, configs)
    )

    ctx.server.registerTool(
      'rate_limit_reset',
      {
        description: 'Reset rate limiting bucket to full capacity',
        inputSchema: {
          type: 'object',
          properties: {
            bucket: {
              type: 'string',
              description: 'Bucket name to reset',
              default: 'default',
            },
            reason: {
              type: 'string',
              description: 'Reason for reset',
            },
          },
        },
      },
      createRateLimitResetTool(buckets)
    )

    // ミドルウェア登録（デフォルトバケットを使用）
    ctx.app.use(async (c, next) => {
      const bucket = buckets.get('default')!
      const clientId = c.req.header('x-client-id') || c.req.header('x-forwarded-for') || 'anonymous'

      const decision = bucket.processRequest(Date.now(), clientId)

      if (decision.allowed) {
        // レスポンスヘッダーに制限情報を追加
        c.res.headers.set('X-RateLimit-Limit', defaultConfig.capacity.toString())
        c.res.headers.set('X-RateLimit-Remaining', decision.tokensRemaining.toString())
        c.res.headers.set(
          'X-RateLimit-Reset',
          new Date(bucket.getState().lastRefill + defaultConfig.windowMs).toISOString()
        )

        await next()
      } else {
        c.res.headers.set('Retry-After', decision.retryAfter.toString())

        return c.json(
          {
            error: 'Rate limit exceeded',
            message: 'Too many requests. Please try again later.',
            retryAfter: decision.retryAfter,
          },
          429
        )
      }
    })
  }
}

// ===== テストシナリオ =====

const testScenarios: readonly TestScenario[] = [
  {
    name: 'Get rate limit status',
    input: { bucket: 'default' },
    expectedOutput: 'tokens',
  },
  {
    name: 'Get rate limit status with history',
    input: { bucket: 'default', includeHistory: true },
    expectedOutput: 'history',
  },
  {
    name: 'Get rate limit configuration',
    input: { action: 'get', bucket: 'default' },
    expectedOutput: 'capacity',
  },
  {
    name: 'Update rate limit configuration',
    input: {
      action: 'set',
      bucket: 'default',
      config: { capacity: 20, refillRate: 3000 },
    },
    expectedOutput: 'updated successfully',
  },
  {
    name: 'Reset rate limit bucket',
    input: { bucket: 'default', reason: 'Test reset' },
    expectedOutput: 'has been reset',
  },
] as const

// ===== 実行設定 =====

const config: ExampleConfig = {
  name: 'rate-limit',
  description: 'Token bucket rate limiting with immutable state management',
  plugin: createRateLimitPlugin({
    defaultBucket: {
      capacity: 10,
      refillRate: 6000, // 6 seconds per token
      windowMs: 60000, // 1 minute window
      enableMetrics: true,
      enableHistory: true,
    },
    buckets: {
      api: { capacity: 50, refillRate: 2000 },
      auth: { capacity: 5, refillRate: 10000 },
    },
  }),
  testScenarios,
  env: {
    RATE_LIMIT_REQUESTS: '10',
    RATE_LIMIT_WINDOW: '60',
    RATE_LIMIT_BURST: '1.0',
  },
} as const

export default config
