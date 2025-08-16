/**
 * Unified logger exports for Hatago
 *
 * Usage:
 * - Basic logging (development): import { createLogger, createDefaultLogger } from '@hatago/core/logger'
 * - Secure logging (production): import { createSecureLogger } from '@hatago/core/logger'
 * - Types: import type { Logger, LoggerConfig } from '@hatago/core/logger'
 */

// Re-export types
export type {
  Logger,
  LoggerConfig,
  LogEntry,
  SecureLogEntry,
  SecureLoggerConfig,
  SecureLogLevel,
  HatagoMode,
} from './types.js'

// Re-export LogLevel enum for convenience
export { LogLevel } from './types.js'

// Basic logger (lightweight, for development and basic use cases)
export { createLogger, createDefaultLogger, DEFAULT_LOGGER_CONFIG } from './basic.js'

// Secure logger (PII masking, for production use)
export {
  createSecureLogger,
  logger as secureLogger,
  setLogLevel,
  getLogLevel,
  type SecureLogger,
} from './secure.js'

/**
 * Create logger based on environment
 * - Development: basic logger with pretty formatting
 * - Production: secure logger with PII masking
 */
export function createEnvironmentLogger(component?: string) {
  const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'

  if (isProduction) {
    const { createSecureLogger } = require('./secure.js')
    return createSecureLogger({
      level: 'info' as const,
      format: 'json' as const,
      transport: 'http' as const,
    })
  }
  const { createDefaultLogger } = require('./basic.js')
  return createDefaultLogger(component)
}

// Legacy exports for backward compatibility
export { createLogger as createBasicLogger } from './basic.js'
