/**
 * Lightweight logger implementation for Hatago
 * Provides structured logging capabilities across all runtimes
 */

import type { SafeValue } from '../types/utils.types.js'
import { TypeGuards } from '../types/utils.types.js'
import type { Logger, LoggerConfig, LogEntry, LogLevel } from './types.js'
import { LogLevel as LogLevelEnum } from './types.js'

/**
 * Create a runtime-agnostic logger
 */
export function createLogger(config: LoggerConfig, component?: string): Logger {
  const shouldLog = (logLevel: LogLevel): boolean => logLevel >= config.level

  const redactSensitiveData = (obj: unknown): SafeValue => {
    if (typeof obj !== 'object' || obj === null) {
      return obj as SafeValue
    }

    if (Array.isArray(obj)) {
      return obj.map(redactSensitiveData)
    }

    const result: Record<string, SafeValue> = {}
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()
      if (config.redactFields.some(field => lowerKey.includes(field))) {
        result[key] = '[REDACTED]'
      } else if (typeof value === 'object') {
        result[key] = redactSensitiveData(value)
      } else {
        result[key] = value as SafeValue
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
      const redactedMeta = redactSensitiveData(meta)
      if (TypeGuards.isObject(redactedMeta)) {
        entry.meta = redactedMeta as Record<string, unknown>
      }
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

    if (config.format === 'pretty') {
      // Pretty format with colors (for development)
      const levelName = LogLevelEnum[entry.level]
      const timestamp = entry.timestamp.split('T')[1]?.split('.')[0] || ''
      const comp = entry.component ? `[${entry.component}]` : ''
      const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''

      return `${timestamp} ${levelName.padEnd(5)} ${comp} ${entry.message}${meta}`
    }

    // Compact format for development
    const levelName = LogLevelEnum[entry.level]
    const timestamp = entry.timestamp.split('T')[1]?.split('.')[0] || ''
    const comp = entry.component ? `[${entry.component}]` : ''
    const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''

    return `${timestamp} ${levelName} ${comp} ${entry.message}${meta}`
  }

  const writeLog = (entry: LogEntry): void => {
    const formatted = formatLogEntry(entry)

    // Use appropriate console method based on level
    switch (entry.level) {
      case LogLevelEnum.DEBUG:
        console.debug(formatted)
        break
      case LogLevelEnum.INFO:
        console.info(formatted)
        break
      case LogLevelEnum.WARN:
        console.warn(formatted)
        break
      case LogLevelEnum.ERROR:
        console.error(formatted)
        break
    }
  }

  return {
    debug: (message: string, meta?: Record<string, unknown>) => {
      if (!shouldLog(LogLevelEnum.DEBUG)) return
      const entry = createLogEntry(LogLevelEnum.DEBUG, message, meta)
      writeLog(entry)
    },

    info: (message: string, meta?: Record<string, unknown>) => {
      if (!shouldLog(LogLevelEnum.INFO)) return
      const entry = createLogEntry(LogLevelEnum.INFO, message, meta)
      writeLog(entry)
    },

    warn: (message: string, meta?: Record<string, unknown>) => {
      if (!shouldLog(LogLevelEnum.WARN)) return
      const entry = createLogEntry(LogLevelEnum.WARN, message, meta)
      writeLog(entry)
    },

    error: (message: string, meta?: Record<string, unknown>, error?: Error) => {
      if (!shouldLog(LogLevelEnum.ERROR)) return
      const entry = createLogEntry(LogLevelEnum.ERROR, message, meta, error)
      writeLog(entry)
    },
  }
}

/**
 * Default logger configuration
 */
export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  level: LogLevelEnum.INFO,
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
    level: isProduction ? LogLevelEnum.INFO : LogLevelEnum.DEBUG,
    format: isProduction ? 'json' : 'compact',
    includeStackTrace: !isProduction,
  }

  return createLogger(config, component)
}
