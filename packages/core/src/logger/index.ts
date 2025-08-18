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
export { createSecureLogger, createDefaultSecureLogger, type SecureLogger } from './secure.js'

import { createDefaultLogger as createBasic } from './basic.js'
// Import for createEnvironmentLogger
import { createSecureLogger as createSecure } from './secure.js'

import type { RuntimeAdapter } from '../types/runtime.js'
import { defaultRuntimeAdapter } from '../types/runtime.js'

/**
 * Create logger based on environment
 * - Development: basic logger with pretty formatting
 * - Production: secure logger with PII masking
 * @param component Component name for the logger
 * @param runtimeAdapter Runtime adapter for environment access
 */
export function createEnvironmentLogger(
  component?: string,
  runtimeAdapter: RuntimeAdapter = defaultRuntimeAdapter
) {
  const isProduction = runtimeAdapter.getEnv('NODE_ENV') === 'production'

  if (isProduction) {
    return createSecure(
      {
        level: 'info' as const,
        format: 'json' as const,
        transport: 'http' as const,
      },
      runtimeAdapter
    )
  }
  return createBasic(component, runtimeAdapter)
}

// Legacy exports for backward compatibility
export { createLogger as createBasicLogger } from './basic.js'

// Global log level management for testing
let globalLogLevel = 'info'

/**
 * Get current global log level
 * @returns Current log level
 */
export function getLogLevel(): string {
  return globalLogLevel
}

/**
 * Set global log level
 * @param level Log level to set
 */
export function setLogLevel(level: string): void {
  globalLogLevel = level
}
