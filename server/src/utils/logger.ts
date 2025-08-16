/**
 * Hatago Logger Utility
 * MCP仕様準拠の構造化ログ出力
 * stdio: stderrのみ使用, HTTP: stdout/stderr適切に使い分け
 *
 * Advanced PII masking powered by Noren v0.6.0
 * - Security plugin: 70%+ token detection rate
 * - JWT, API keys, HTTP headers, cookies
 * - Environment controls: NOREN_MASKING=false to disable
 * - Fallback: Traditional key-based masking if Noren fails
 */

import { Registry, redactText } from '@himorishige/noren-core'
import * as securityPlugin from '@himorishige/noren-plugin-security'

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
export type LogFormat = 'json' | 'pretty'
export type HatagoMode = 'stdio' | 'http'

export interface LogEntry {
  time: string
  level: LogLevel
  msg: string
  transport: HatagoMode
  session_id?: string
  request_id?: string
  tool?: string
  method?: string
  duration_ms?: number
  error?: {
    code?: string
    stack?: string
  }
  [key: string]: any
}

export interface LoggerConfig {
  level: LogLevel
  format: LogFormat
  transport: HatagoMode
  redactKeys: string[]
  sampleRate: number
}

const LOG_LEVELS: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
}

// ANSIカラーコード
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
}

// レベル別カラー設定
const LEVEL_COLORS: Record<LogLevel, string> = {
  fatal: COLORS.red + COLORS.bright, // 明るい赤
  error: COLORS.red, // 赤
  warn: COLORS.yellow, // 黄色
  info: COLORS.green, // 緑
  debug: COLORS.cyan, // シアン
  trace: COLORS.gray, // グレー
}

const DEFAULT_REDACT_KEYS = [
  'password',
  'token',
  'api_key',
  'authorization',
  'bearer',
  'secret',
  'credential',
  'access_token',
  'refresh_token',
]

// Noren registry (lazy initialization)
let norenRegistry: Registry | null = null

async function getNorenRegistry(): Promise<Registry> {
  if (!norenRegistry) {
    // Basic registry configuration
    norenRegistry = new Registry({
      defaultAction: 'mask',
      contextHints: ['password', 'token', 'api', 'secret', 'auth'],
      validationStrictness: 'balanced',
    })

    // Load security plugin: JWT, API keys, HTTP headers, cookies (70%+ detection rate)
    try {
      norenRegistry.use(securityPlugin.detectors, securityPlugin.maskers)
    } catch (error) {
      // Fallback if security plugin fails to load - use basic configuration only
      console.warn('Failed to load Noren security plugin, using basic configuration:', error)
    }
  }
  return norenRegistry
}

class Logger {
  private config: LoggerConfig
  private context: Record<string, any> = {}
  private useNorenMasking: boolean

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      format: (process.env.LOG_FORMAT as LogFormat) || 'pretty',
      transport: (process.env.HATAGO_TRANSPORT as HatagoMode) || 'http',
      redactKeys: process.env.LOG_REDACT?.split(',') || DEFAULT_REDACT_KEYS,
      sampleRate: parseFloat(process.env.LOG_SAMPLE_RATE || '1.0'),
      ...config,
    }

    // Noren masking (default: enabled, disable with NOREN_MASKING=false)
    this.useNorenMasking = process.env.NOREN_MASKING !== 'false'

    // stdio モードではstdout汚染を防ぐガード
    if (this.config.transport === 'stdio') {
      this.guardStdout()
    }
  }

  /**
   * 子ロガーを作成（セッション/リクエストコンテキスト用）
   */
  child(context: Record<string, any>): Logger {
    const child = new Logger(this.config)
    child.context = { ...this.context, ...context }
    child.useNorenMasking = this.useNorenMasking
    return child
  }

  /**
   * レベル判定
   */
  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level]
  }

  /**
   * ログ出力
   */
  private async log(level: LogLevel, msg: string, meta: Record<string, any> = {}) {
    if (!this.isLevelEnabled(level)) return

    // サンプリング
    if (Math.random() > this.config.sampleRate && level !== 'fatal' && level !== 'error') {
      return
    }

    const entry: LogEntry = {
      time: new Date().toISOString(),
      level,
      msg,
      transport: this.config.transport,
      ...this.context,
      ...(await this.redact(meta)),
    }

    const output = this.format(entry)
    this.write(level, output)

    // fatalレベルでプロセス終了
    if (level === 'fatal') {
      process.exit(1)
    }
  }

  /**
   * 機密情報をマスク（Noren統合版）
   */
  private async redact(obj: any): Promise<any> {
    if (obj === null || typeof obj !== 'object') {
      // プリミティブ値の場合、Norenを使って文字列内のPIIをマスク
      if (this.useNorenMasking && typeof obj === 'string') {
        try {
          const registry = await getNorenRegistry()
          return await redactText(registry, obj)
        } catch (error) {
          // Noren失敗時は従来方式でフォールバック
          return obj
        }
      }
      return obj
    }

    const result: any = Array.isArray(obj) ? [] : {}

    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase()

      // キーベースの従来マスキング
      if (this.config.redactKeys.some(redactKey => keyLower.includes(redactKey.toLowerCase()))) {
        result[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        result[key] = await this.redact(value)
      } else if (this.useNorenMasking && typeof value === 'string') {
        // Norenを使った値レベルのマスキング
        try {
          const registry = await getNorenRegistry()
          result[key] = await redactText(registry, value)
        } catch (error) {
          // Noren失敗時は元の値をそのまま使用
          result[key] = value
        }
      } else {
        result[key] = value
      }
    }

    return result
  }

  /**
   * ログエントリのフォーマット
   */
  private format(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry)
    }

    // Pretty format for development with colors
    const timestamp = entry.time.substring(11, 23) // HH:mm:ss.SSS
    const level = entry.level.toUpperCase().padEnd(5)

    // カラー対応かチェック（TTYかつNO_COLORが設定されていない）
    const useColors = this.shouldUseColors()

    const levelColor = useColors ? LEVEL_COLORS[entry.level] : ''
    const reset = useColors ? COLORS.reset : ''
    const dimColor = useColors ? COLORS.dim : ''
    const brightColor = useColors ? COLORS.bright : ''

    // タイムスタンプとレベルをカラー化
    const coloredTimestamp = `${dimColor}[${timestamp}]${reset}`
    const coloredLevel = `${levelColor}${level}${reset}`
    const prefix = `${coloredTimestamp} ${coloredLevel}`

    // メッセージ本体（重要なメッセージは太字）
    const messageText =
      entry.level === 'fatal' || entry.level === 'error'
        ? `${brightColor}${entry.msg}${reset}`
        : entry.msg

    let message = `${prefix} ${messageText}`

    // メタデータ情報（暗い色で表示）
    const metaColor = useColors ? COLORS.gray : ''
    if (entry.session_id) message += ` ${metaColor}session=${entry.session_id}${reset}`
    if (entry.request_id) message += ` ${metaColor}req=${entry.request_id}${reset}`
    if (entry.tool) message += ` ${metaColor}tool=${entry.tool}${reset}`
    if (entry.method) message += ` ${metaColor}method=${entry.method}${reset}`
    if (entry.duration_ms !== undefined)
      message += ` ${metaColor}duration=${entry.duration_ms}ms${reset}`

    // スタック情報（赤色で表示）
    if (entry.error?.stack && this.config.level === 'debug') {
      const stackColor = useColors ? COLORS.red : ''
      message += `\n${stackColor}${entry.error.stack}${reset}`
    }

    return message
  }

  /**
   * カラー出力を使用するかどうか判定
   */
  private shouldUseColors(): boolean {
    // NO_COLOR環境変数が設定されている場合はカラー無効
    if (process.env.NO_COLOR) return false

    // FORCE_COLOR環境変数が設定されている場合は強制有効
    if (process.env.FORCE_COLOR) return true

    // TTYでない場合（ファイルリダイレクト等）はカラー無効
    if (this.config.transport === 'stdio') {
      return process.stderr.isTTY || false
    } else {
      // HTTPモードでは開発時のみ（stdoutがTTY）
      return process.stdout.isTTY || false
    }
  }

  /**
   * 実際の出力
   */
  private write(level: LogLevel, output: string) {
    // stdio モードでは全てstderrへ
    if (this.config.transport === 'stdio') {
      process.stderr.write(output + '\n')
      return
    }

    // HTTP モードでの使い分け
    if (level === 'fatal' || level === 'error') {
      process.stderr.write(output + '\n')
    } else {
      // info以下は開発時はstdout、本番時はstderr
      const target = process.env.NODE_ENV === 'production' ? process.stderr : process.stdout
      target.write(output + '\n')
    }
  }

  /**
   * stdout汚染防止ガード（stdioモード用）
   */
  private guardStdout() {
    // console.log を無効化
    const originalLog = console.log
    console.log = (...args: any[]) => {
      process.stderr.write('[STDOUT-GUARD] Redirected console.log: ' + args.join(' ') + '\n')
    }

    // process.stdout.write を監視
    const originalWrite = process.stdout.write
    process.stdout.write = function (chunk: any, ...args: any[]) {
      process.stderr.write('[STDOUT-GUARD] Prevented stdout write: ' + String(chunk))
      return true
    }
  }

  // ログレベルメソッド
  fatal(msg: string, meta?: Record<string, any>) {
    return this.log('fatal', msg, meta)
  }
  error(msg: string, meta?: Record<string, any>) {
    return this.log('error', msg, meta)
  }
  warn(msg: string, meta?: Record<string, any>) {
    return this.log('warn', msg, meta)
  }
  info(msg: string, meta?: Record<string, any>) {
    return this.log('info', msg, meta)
  }
  debug(msg: string, meta?: Record<string, any>) {
    return this.log('debug', msg, meta)
  }
  trace(msg: string, meta?: Record<string, any>) {
    return this.log('trace', msg, meta)
  }
}

// デフォルトロガーインスタンス
export const logger = new Logger()

// ヘルパー関数
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config)
}

export function setLogLevel(level: LogLevel) {
  logger['config'].level = level
}

export function getLogLevel(): LogLevel {
  return logger['config'].level
}
