/**
 * Secure Logger for Hatago
 * MCP specification compliant structured logging with PII masking
 * stdio: stderr only, HTTP: proper stdout/stderr separation
 *
 * Advanced PII masking powered by Noren v0.6.0
 * - Security plugin: 70%+ token detection rate
 * - JWT, API keys, HTTP headers, cookies
 * - Environment controls: NOREN_MASKING=false to disable
 * - Fallback: Traditional key-based masking if Noren fails
 */

import { Registry, redactText } from '@himorishige/noren-core'
import * as securityPlugin from '@himorishige/noren-plugin-security'
import type { RuntimeAdapter } from '../types/runtime.js'
import { defaultRuntimeAdapter, detectRuntime } from '../types/runtime.js'
import type { HatagoMode, SecureLogEntry, SecureLogLevel, SecureLoggerConfig } from './types.js'

const LOG_LEVELS: Record<SecureLogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
}

// ANSI color codes
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

// Level-specific colors
const LEVEL_COLORS: Record<SecureLogLevel, string> = {
  fatal: COLORS.red + COLORS.bright, // bright red
  error: COLORS.red, // red
  warn: COLORS.yellow, // yellow
  info: COLORS.green, // green
  debug: COLORS.cyan, // cyan
  trace: COLORS.gray, // gray
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

export interface SecureLogger {
  fatal(msg: string, meta?: Record<string, unknown>): Promise<void>
  error(msg: string, meta?: Record<string, unknown>): Promise<void>
  warn(msg: string, meta?: Record<string, unknown>): Promise<void>
  info(msg: string, meta?: Record<string, unknown>): Promise<void>
  debug(msg: string, meta?: Record<string, unknown>): Promise<void>
  trace(msg: string, meta?: Record<string, unknown>): Promise<void>
  isLevelEnabled(level: SecureLogLevel): boolean
  setLevel(level: SecureLogLevel): void
  getLevel(): SecureLogLevel
  child(context: Record<string, unknown>): SecureLogger
}

/**
 * Create a secure logger with PII masking capabilities
 * @param config Logger configuration
 * @param runtimeAdapter Runtime adapter for environment and I/O operations
 */
export function createSecureLogger(
  config?: Partial<SecureLoggerConfig>,
  runtimeAdapter: RuntimeAdapter = defaultRuntimeAdapter
): SecureLogger {
  // Default configuration
  const defaultConfig: SecureLoggerConfig = {
    level: (runtimeAdapter.getEnv('LOG_LEVEL') as SecureLogLevel) || 'info',
    format: (runtimeAdapter.getEnv('LOG_FORMAT') as 'json' | 'pretty') || 'pretty',
    transport: (runtimeAdapter.getEnv('HATAGO_TRANSPORT') as HatagoMode) || 'http',
    redactKeys: runtimeAdapter.getEnv('LOG_REDACT')?.split(',') || DEFAULT_REDACT_KEYS,
    sampleRate: Number.parseFloat(runtimeAdapter.getEnv('LOG_SAMPLE_RATE') || '1.0'),
  }

  const currentConfig = { ...defaultConfig, ...config }
  const context: Record<string, unknown> = {}

  // Noren masking (default: enabled, disable with NOREN_MASKING=false)
  const useNorenMasking = runtimeAdapter.getEnv('NOREN_MASKING') !== 'false'

  // stdio mode guard for stdout pollution prevention
  if (currentConfig.transport === 'stdio') {
    guardStdout()
  }

  /**
   * Level checking
   */
  const isLevelEnabled = (level: SecureLogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentConfig.level]
  }

  /**
   * PII masking with Noren integration
   */
  const redact = async (obj: unknown): Promise<unknown> => {
    if (obj === null || typeof obj !== 'object') {
      // For primitive values, use Noren to mask PII in strings
      if (useNorenMasking && typeof obj === 'string') {
        try {
          const registry = await getNorenRegistry()
          return await redactText(registry, obj)
        } catch (_error) {
          // Fallback to original value if Noren fails
          return obj
        }
      }
      return obj
    }

    const result: Record<string, unknown> = Array.isArray(obj)
      ? ([] as unknown as Record<string, unknown>)
      : {}

    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase()

      // Traditional key-based masking
      if (currentConfig.redactKeys.some(redactKey => keyLower.includes(redactKey.toLowerCase()))) {
        result[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        result[key] = await redact(value)
      } else if (useNorenMasking && typeof value === 'string') {
        // Noren value-level masking
        try {
          const registry = await getNorenRegistry()
          result[key] = await redactText(registry, value)
        } catch (_error) {
          // Fallback to original value if Noren fails
          result[key] = value
        }
      } else {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Log entry formatting
   */
  const format = (entry: SecureLogEntry): string => {
    if (currentConfig.format === 'json') {
      return JSON.stringify(entry)
    }

    // Pretty format for development with colors
    const timestamp = entry.time.substring(11, 23) // HH:mm:ss.SSS
    const level = entry.level.toUpperCase().padEnd(5)

    // Color support check (TTY and NO_COLOR not set)
    const useColors = shouldUseColors()

    const levelColor = useColors ? LEVEL_COLORS[entry.level] : ''
    const reset = useColors ? COLORS.reset : ''
    const dimColor = useColors ? COLORS.dim : ''
    const brightColor = useColors ? COLORS.bright : ''

    // Colorized timestamp and level
    const coloredTimestamp = `${dimColor}[${timestamp}]${reset}`
    const coloredLevel = `${levelColor}${level}${reset}`
    const prefix = `${coloredTimestamp} ${coloredLevel}`

    // Message body (important messages in bold)
    const messageText =
      entry.level === 'fatal' || entry.level === 'error'
        ? `${brightColor}${entry.msg}${reset}`
        : entry.msg

    let message = `${prefix} ${messageText}`

    // Metadata information (in dim color)
    const metaColor = useColors ? COLORS.gray : ''
    if (entry.session_id) message += ` ${metaColor}session=${entry.session_id}${reset}`
    if (entry.request_id) message += ` ${metaColor}req=${entry.request_id}${reset}`
    if (entry.tool) message += ` ${metaColor}tool=${entry.tool}${reset}`
    if (entry.method) message += ` ${metaColor}method=${entry.method}${reset}`
    if (entry.duration_ms !== undefined)
      message += ` ${metaColor}duration=${entry.duration_ms}ms${reset}`

    // Stack information (in red)
    if (entry.error?.stack && currentConfig.level === 'debug') {
      const stackColor = useColors ? COLORS.red : ''
      message += `\n${stackColor}${entry.error.stack}${reset}`
    }

    return message
  }

  /**
   * Color output determination
   * Using Web Standards approach - no TTY detection needed
   */
  const shouldUseColors = (): boolean => {
    // Disabled if NO_COLOR environment variable is set
    if (runtimeAdapter.getEnv('NO_COLOR')) return false

    // Forced enabled if FORCE_COLOR is set
    if (runtimeAdapter.getEnv('FORCE_COLOR')) return true

    // In stdio mode, default to no colors (can override with FORCE_COLOR)
    if (currentConfig.transport === 'stdio') {
      return false
    }

    // In HTTP mode, use colors in development
    return runtimeAdapter.getEnv('NODE_ENV') !== 'production'
  }

  /**
   * Actual output using Web Standards console API
   */
  const write = (level: SecureLogLevel, output: string) => {
    // Use appropriate console method based on level
    // Console API is a Web Standard and works across all runtimes
    switch (level) {
      case 'fatal':
      case 'error':
        console.error(output)
        break
      case 'warn':
        console.warn(output)
        break
      case 'debug':
      case 'trace':
        // Some runtimes don't have console.debug, fallback to console.log
        if (typeof console.debug === 'function') {
          console.debug(output)
        } else {
          console.log(output)
        }
        break
      default:
        console.log(output)
    }
  }

  /**
   * Main logging function
   */
  const log = async (level: SecureLogLevel, msg: string, meta: Record<string, unknown> = {}) => {
    if (!isLevelEnabled(level)) return

    // Sampling
    if (Math.random() > currentConfig.sampleRate && level !== 'fatal' && level !== 'error') {
      return
    }

    const redactedMeta = await redact(meta)
    const entry: SecureLogEntry = {
      time: new Date().toISOString(),
      level,
      msg,
      transport: currentConfig.transport,
      ...context,
      ...(typeof redactedMeta === 'object' && redactedMeta !== null
        ? (redactedMeta as Record<string, unknown>)
        : {}),
    }

    const output = format(entry)
    write(level, output)

    // Process exit on fatal level - only in Node.js runtime
    // Other runtimes don't support process.exit
    if (level === 'fatal' && detectRuntime() === 'node') {
      // Direct call to process.exit for Node.js
      ;(globalThis as any).process?.exit(1)
    }
  }

  return {
    fatal: (msg: string, meta?: Record<string, unknown>) => log('fatal', msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
    debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
    trace: (msg: string, meta?: Record<string, unknown>) => log('trace', msg, meta),

    isLevelEnabled,

    setLevel: (level: SecureLogLevel) => {
      currentConfig.level = level
    },

    getLevel: (): SecureLogLevel => currentConfig.level,

    child: (childContext: Record<string, unknown>): SecureLogger => {
      const childLogger = createSecureLogger(currentConfig, runtimeAdapter)
      // Copy current context and add child context
      const combinedContext = { ...context, ...childContext }
      // Set the context on the child logger
      Object.assign(childLogger, { context: combinedContext })
      return childLogger
    },
  }
}

/**
 * stdout pollution guard (for stdio mode)
 * Note: This function still uses console directly as it's modifying console behavior
 */
function guardStdout() {
  // Disable console.log
  const _originalLog = console.log
  console.log = (...args: unknown[]) => {
    // Use console.error to redirect log messages in stdio mode
    console.error(`[STDOUT-GUARD] Redirected console.log: ${args.join(' ')}`)
  }

  // Note: stdout.write monitoring requires runtime-specific implementation
  // This should be handled by the runtime adapter if needed
}

// Create logger with runtime adapter
export function createDefaultSecureLogger(runtimeAdapter?: RuntimeAdapter): SecureLogger {
  return createSecureLogger(undefined, runtimeAdapter)
}
