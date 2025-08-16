/**
 * Error types and Result pattern for Hatago
 */

/**
 * Base error class for all Hatago errors
 */
export class HatagoError extends Error {
  public readonly code: string
  public readonly details?: unknown

  constructor(message: string, code: string, details?: unknown) {
    super(message)
    this.name = 'HatagoError'
    this.code = code
    this.details = details
  }
}

/**
 * Plugin-related errors
 */
export class PluginError extends HatagoError {
  constructor(message: string, details?: unknown) {
    super(message, 'PLUGIN_ERROR', details)
    this.name = 'PluginError'
  }
}

/**
 * Validation errors
 */
export class ValidationError extends HatagoError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details)
    this.name = 'ValidationError'
  }
}

/**
 * MCP communication errors
 */
export class MCPError extends HatagoError {
  constructor(message: string, details?: unknown) {
    super(message, 'MCP_ERROR', details)
    this.name = 'MCPError'
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends HatagoError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIG_ERROR', details)
    this.name = 'ConfigError'
  }
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

/**
 * Utility functions for Result type
 */
export const Result = {
  /**
   * Create a successful result
   */
  ok: <T>(value: T): Result<T> => ({ ok: true, value }),

  /**
   * Create an error result
   */
  error: <E = Error>(error: E): Result<never, E> => ({ ok: false, error }),

  /**
   * Map over a successful result
   */
  map: <T, U, E = Error>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> => {
    return result.ok ? { ok: true, value: fn(result.value) } : result
  },

  /**
   * Chain results together
   */
  flatMap: <T, U, E = Error>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>
  ): Result<U, E> => {
    return result.ok ? fn(result.value) : result
  },

  /**
   * Get value or throw error
   */
  unwrap: <T>(result: Result<T>): T => {
    if (result.ok) {
      return result.value
    }
    throw result.error
  },

  /**
   * Get value or return default
   */
  unwrapOr: <T>(result: Result<T>, defaultValue: T): T => {
    return result.ok ? result.value : defaultValue
  },
}
