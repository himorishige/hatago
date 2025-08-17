/**
 * Logger Plugin Example - 関数型構造化ログ実装
 *
 * PIIマスキング、ログレベル制御、フォーマッター合成を含む
 * 完全に関数型でログ処理を構築
 */

import type { HatagoPlugin } from '@hatago/core'
import type { ExampleConfig, LogEntry, TestScenario } from '../_shared/types.js'

// ===== 型定義（不変データ構造） =====

/**
 * ログレベル（enumとして定義）
 */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/**
 * ログ設定（読み取り専用）
 */
interface LoggerConfig {
  readonly level: LogLevel
  readonly format: 'json' | 'pretty'
  readonly enableMasking: boolean
  readonly sampleRate: number
}

/**
 * ログエントリ（完全に不変）
 */
interface LogEntryWithMetadata {
  readonly timestamp: string
  readonly level: LogLevel
  readonly message: string
  readonly data?: DeepReadonly<Record<string, unknown>>
  readonly requestId?: string
  readonly userId?: string
}

/**
 * ログフォーマッター関数型
 */
type LogFormatter = (entry: LogEntryWithMetadata) => string

/**
 * ログフィルター関数型
 */
type LogFilter = (entry: LogEntryWithMetadata) => boolean

/**
 * 不変性ヘルパー
 */
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

// ===== 純粋関数群 =====

/**
 * デフォルト設定（不変）
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  format: 'pretty',
  enableMasking: true,
  sampleRate: 1.0,
} as const

/**
 * 環境変数からの設定読み込み（純粋関数）
 */
const loadConfigFromEnv = (env: Record<string, string | undefined>): Partial<LoggerConfig> => {
  return {
    level: (env.LOG_LEVEL as LogLevel) || 'info',
    format: (env.LOG_FORMAT as 'json' | 'pretty') || 'pretty',
    enableMasking: env.NOREN_MASKING !== 'false',
    sampleRate: env.LOG_SAMPLE_RATE ? Number.parseFloat(env.LOG_SAMPLE_RATE) : 1.0,
  }
}

/**
 * ログレベルの優先度取得（純粋関数）
 */
const getLogLevelPriority = (level: LogLevel): number => {
  const priorities = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
    fatal: 5,
  } as const
  return priorities[level]
}

/**
 * ログレベルフィルター（高階関数）
 */
const createLevelFilter =
  (minLevel: LogLevel): LogFilter =>
  entry =>
    getLogLevelPriority(entry.level) >= getLogLevelPriority(minLevel)

/**
 * サンプリングフィルター（確率的フィルタリング）
 */
const createSampleFilter =
  (sampleRate: number): LogFilter =>
  entry => {
    // エラーレベル以上は必ず通す
    if (getLogLevelPriority(entry.level) >= getLogLevelPriority('error')) {
      return true
    }
    return Math.random() < sampleRate
  }

/**
 * タイムスタンプ追加（純粋関数）
 */
const addTimestamp = (entry: Omit<LogEntryWithMetadata, 'timestamp'>): LogEntryWithMetadata => ({
  ...entry,
  timestamp: new Date().toISOString(),
})

/**
 * PII マスキング（純粋関数・再帰的）
 */
const maskSensitiveData = (data: unknown): unknown => {
  if (typeof data === 'string') {
    return (
      data
        // メールアドレス
        .replace(/\b[\w\.-]+@[\w\.-]+\.\w+\b/g, '***@***.***')
        // クレジットカード番号
        .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '****-****-****-****')
        // APIトークン（長い英数字）
        .replace(/\b[A-Za-z0-9]{32,}\b/g, '***TOKEN***')
        // 電話番号
        .replace(/\b\d{3}-\d{3,4}-\d{4}\b/g, '***-***-****')
    )
  }

  if (Array.isArray(data)) {
    return data.map(maskSensitiveData)
  }

  if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        // 機密情報のキーパターン
        /password|secret|token|key|auth|bearer|session|credit|ssn/i.test(key)
          ? '***MASKED***'
          : maskSensitiveData(value),
      ])
    )
  }

  return data
}

/**
 * JSONフォーマッター（純粋関数）
 */
const formatAsJson: LogFormatter = entry => {
  const logObject = {
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
    ...(entry.data && { data: entry.data }),
    ...(entry.requestId && { requestId: entry.requestId }),
    ...(entry.userId && { userId: entry.userId }),
  }
  return JSON.stringify(logObject)
}

/**
 * Prettyフォーマッター（純粋関数）
 */
const formatAsPretty: LogFormatter = entry => {
  const timestamp = entry.timestamp
  const level = entry.level.toUpperCase().padEnd(5)
  const message = entry.message

  let output = `${timestamp} [${level}] ${message}`

  if (entry.data) {
    output += ` ${JSON.stringify(entry.data, null, 2)}`
  }

  if (entry.requestId) {
    output += ` [req:${entry.requestId}]`
  }

  return output
}

/**
 * フォーマッター選択（純粋関数）
 */
const selectFormatter = (format: 'json' | 'pretty'): LogFormatter => {
  return format === 'json' ? formatAsJson : formatAsPretty
}

/**
 * ログエントリ変換パイプライン（関数合成）
 */
const createLogPipeline = (config: LoggerConfig) => {
  // フィルター合成
  const filter = (entry: LogEntryWithMetadata): boolean => {
    return createLevelFilter(config.level)(entry) && createSampleFilter(config.sampleRate)(entry)
  }

  // 変換関数合成
  const transform = (entry: Omit<LogEntryWithMetadata, 'timestamp'>): LogEntryWithMetadata => {
    let processed = addTimestamp(entry)

    // PIIマスキング（条件付き）
    if (config.enableMasking && processed.data) {
      processed = {
        ...processed,
        data: maskSensitiveData(processed.data) as DeepReadonly<Record<string, unknown>>,
      }
    }

    return processed
  }

  // フォーマッター選択
  const format = selectFormatter(config.format)

  return {
    filter,
    transform,
    format,
  }
}

/**
 * ログ書き込み（副作用関数）
 */
const writeLog = (formattedLog: string, level: LogLevel): void => {
  // レベルに応じた出力先選択
  const output =
    getLogLevelPriority(level) >= getLogLevelPriority('error') ? console.error : console.log

  output(formattedLog)
}

// ===== MCPツール実装 =====

/**
 * ログクエリツールの実装
 */
const createLogsQueryTool = (logStore: LogEntryWithMetadata[]) => async (request: any) => {
  const {
    level,
    since,
    limit = 100,
    search,
  } = request.params.arguments as {
    level?: LogLevel
    since?: string
    limit?: number
    search?: string
  }

  let filtered = [...logStore]

  // レベルフィルタ
  if (level) {
    const minPriority = getLogLevelPriority(level)
    filtered = filtered.filter(entry => getLogLevelPriority(entry.level) >= minPriority)
  }

  // 日時フィルタ
  if (since) {
    const sinceDate = new Date(since)
    filtered = filtered.filter(entry => new Date(entry.timestamp) >= sinceDate)
  }

  // キーワード検索
  if (search) {
    const searchLower = search.toLowerCase()
    filtered = filtered.filter(
      entry =>
        entry.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(entry.data).toLowerCase().includes(searchLower)
    )
  }

  // 件数制限
  const result = filtered.slice(-limit)

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  }
}

/**
 * ログ設定ツールの実装
 */
const createLogsConfigTool =
  (config: LoggerConfig, updateConfig: (newConfig: Partial<LoggerConfig>) => void) =>
  async (request: any) => {
    const { action, config: newConfig } = request.params.arguments as {
      action: 'get' | 'set'
      config?: Partial<LoggerConfig>
    }

    if (action === 'get') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(config, null, 2),
          },
        ],
      }
    }

    if (action === 'set' && newConfig) {
      updateConfig(newConfig)
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

// ===== プラグイン実装 =====

/**
 * ロガープラグインの作成（高階関数）
 */
export const createLoggerPlugin = (userConfig: Partial<LoggerConfig> = {}): HatagoPlugin => {
  return async ctx => {
    // 設定の合成（環境変数 > ユーザー設定 > デフォルト）
    const envConfig = loadConfigFromEnv(ctx.env || {})
    const config: LoggerConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      ...envConfig,
    }

    // ログストア（メモリ内）
    const logStore: LogEntryWithMetadata[] = []
    const maxStoreSize = 1000

    // ログパイプライン作成
    const { filter, transform, format } = createLogPipeline(config)

    // ログ関数の作成
    const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
      const entry = transform({
        level,
        message,
        data: data as DeepReadonly<Record<string, unknown>>,
        requestId: ctx.env?.REQUEST_ID as string,
        userId: ctx.env?.USER_ID as string,
      })

      // フィルタリング
      if (!filter(entry)) return

      // ストアに保存（サイズ制限付き）
      logStore.push(entry)
      if (logStore.length > maxStoreSize) {
        logStore.shift()
      }

      // 出力
      const formatted = format(entry)
      writeLog(formatted, level)
    }

    // 設定更新関数
    const updateConfig = (newConfig: Partial<LoggerConfig>) => {
      Object.assign(config, newConfig)
    }

    // MCPツール登録
    ctx.server.registerTool(
      'logs_query',
      {
        description: 'Query and filter log entries',
        inputSchema: {
          type: 'object',
          properties: {
            level: {
              type: 'string',
              enum: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
              description: 'Minimum log level to include',
            },
            since: {
              type: 'string',
              description: 'ISO timestamp to filter logs from',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of entries to return',
              default: 100,
            },
            search: {
              type: 'string',
              description: 'Search keyword in messages and data',
            },
          },
        },
      },
      createLogsQueryTool(logStore)
    )

    ctx.server.registerTool(
      'logs_config',
      {
        description: 'Get or update logger configuration',
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
                level: {
                  type: 'string',
                  enum: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
                },
                format: { type: 'string', enum: ['json', 'pretty'] },
                enableMasking: { type: 'boolean' },
                sampleRate: { type: 'number', minimum: 0, maximum: 1 },
              },
              description: 'New configuration (for set action)',
            },
          },
          required: ['action'],
        },
      },
      createLogsConfigTool(config, updateConfig)
    )

    // ミドルウェア登録（リクエストログ）
    ctx.app.use(async (c, next) => {
      const start = Date.now()
      const method = c.req.method
      const path = c.req.path

      try {
        await next()
        const duration = Date.now() - start

        log('info', 'Request processed', {
          method,
          path,
          duration,
          status: c.res.status,
        })
      } catch (error) {
        const duration = Date.now() - start

        log('error', 'Request failed', {
          method,
          path,
          duration,
          error: error instanceof Error ? error.message : String(error),
        })

        throw error
      }
    })

    // 初期ログ出力
    log('info', 'Logger plugin initialized', { config })
  }
}

// ===== テストシナリオ =====

const testScenarios: readonly TestScenario[] = [
  {
    name: 'Query recent logs',
    input: { level: 'info', limit: 10 },
    expectedOutput: 'Logger plugin initialized',
  },
  {
    name: 'Get logger configuration',
    input: { action: 'get' },
    expectedOutput: '"level"',
  },
  {
    name: 'Update logger configuration',
    input: {
      action: 'set',
      config: { level: 'debug', format: 'json' },
    },
    expectedOutput: 'updated successfully',
  },
] as const

// ===== 実行設定 =====

const config: ExampleConfig = {
  name: 'logger',
  description: 'Structured logging with PII masking and functional composition',
  plugin: createLoggerPlugin({
    level: 'debug',
    format: 'pretty',
    enableMasking: true,
    sampleRate: 1.0,
  }),
  testScenarios,
  env: {
    LOG_LEVEL: 'debug',
    LOG_FORMAT: 'pretty',
    NOREN_MASKING: 'true',
  },
} as const

export default config
