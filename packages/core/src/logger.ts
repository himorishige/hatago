/**
 * Lightweight logger implementation for Hatago
 * Provides structured logging capabilities across all runtimes
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
  component?: string
  trace_id?: string
  error?: {
    name: string
    message: string
    stack?: string
  }
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>, error?: Error): void
}

export interface LoggerConfig {
  level: LogLevel
  format: 'json' | 'compact'
  includeStackTrace: boolean
  redactFields: string[]
}

/**
 * Create a runtime-agnostic logger
 */
export function createLogger(config: LoggerConfig, component?: string): Logger {
  const shouldLog = (logLevel: LogLevel): boolean => logLevel >= config.level

  const redactSensitiveData = (obj: unknown): unknown => {
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(redactSensitiveData)
    }

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()
      if (config.redactFields.some(field => lowerKey.includes(field))) {
        result[key] = '[REDACTED]'
      } else if (typeof value === 'object') {
        result[key] = redactSensitiveData(value)
      } else {
        result[key] = value
      }
    }
    return result
  }

  const createLogEntry = (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    error?: Error
  ): LogEntry => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    }

    if (component) {
      entry.component = component
    }

    if (meta) {
      entry.meta = redactSensitiveData(meta) as any
    }

    if (error && config.includeStackTrace) {
      entry.error = {
        name: error.name,
        message: error.message,
        ...(error.stack && { stack: error.stack }),
      }
    }

    return entry
  }

  const formatLogEntry = (entry: LogEntry): string => {
    if (config.format === 'json') {
      return JSON.stringify(entry)
    }

    // Compact format for development
    const levelName = LogLevel[entry.level]
    const timestamp = entry.timestamp.split('T')[1]?.split('.')[0] || ''
    const comp = entry.component ? `[${entry.component}]` : ''
    const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''

    return `${timestamp} ${levelName} ${comp} ${entry.message}${meta}`
  }

  const writeLog = (entry: LogEntry): void => {
    const formatted = formatLogEntry(entry)

    // Use appropriate console method based on level
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formatted)
        break
      case LogLevel.INFO:
        console.info(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        break
      case LogLevel.ERROR:
        console.error(formatted)
        break
    }
  }

  return {
    debug: (message: string, meta?: Record<string, unknown>) => {
      if (!shouldLog(LogLevel.DEBUG)) return
      const entry = createLogEntry(LogLevel.DEBUG, message, meta)
      writeLog(entry)
    },

    info: (message: string, meta?: Record<string, unknown>) => {
      if (!shouldLog(LogLevel.INFO)) return
      const entry = createLogEntry(LogLevel.INFO, message, meta)
      writeLog(entry)
    },

    warn: (message: string, meta?: Record<string, unknown>) => {
      if (!shouldLog(LogLevel.WARN)) return
      const entry = createLogEntry(LogLevel.WARN, message, meta)
      writeLog(entry)
    },

    error: (message: string, meta?: Record<string, unknown>, error?: Error) => {
      if (!shouldLog(LogLevel.ERROR)) return
      const entry = createLogEntry(LogLevel.ERROR, message, meta, error)
      writeLog(entry)
    },
  }
}

/**
 * Default logger configuration
 */
export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  format: 'compact',
  includeStackTrace: true,
  redactFields: ['password', 'token', 'secret', 'key', 'authorization'],
}

/**
 * Create default logger with common settings
 */
export function createDefaultLogger(component?: string): Logger {
  const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'

  const config: LoggerConfig = {
    ...DEFAULT_LOGGER_CONFIG,
    level: isProduction ? LogLevel.INFO : LogLevel.DEBUG,
    format: isProduction ? 'json' : 'compact',
    includeStackTrace: !isProduction,
  }

  return createLogger(config, component)
}
