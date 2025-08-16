/**
 * Utility types for enhanced type safety
 */

/**
 * Deep readonly type
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

/**
 * Mutable version of readonly object
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P]
}

/**
 * Make specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Make specific properties required
 */
export type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>

/**
 * Safe array/object type for redaction
 */
export type SafeValue = string | number | boolean | null | undefined | SafeObject | SafeArray

export type SafeObject = {
  [key: string]: SafeValue
}

export type SafeArray = SafeValue[]

/**
 * Health check status type
 */
export type HealthStatus = 'healthy' | 'warn' | 'error'

/**
 * Health check details with mutable status
 */
export interface HealthCheckDetails {
  status: HealthStatus
  details: {
    [key: string]: unknown
    warning?: string
    error?: string
  }
}

/**
 * Structured health check result
 */
export interface HealthChecks {
  memory: HealthCheckDetails
  [key: string]: HealthCheckDetails
}

/**
 * Plugin verifier with typed registry
 */
export interface PluginVerifierWithRegistry {
  defaultRegistry?: {
    listKeys(): string[]
  }
  generateKeyPair(algorithm: string): Promise<{
    publicKey: string
    privateKey: string
  }>
  [key: string]: unknown
}

/**
 * Hono context with trace ID
 */
export interface HonoContextWithTrace {
  set(key: 'traceId', value: string): void
  get(key: 'traceId'): string | undefined
  [key: string]: unknown
}

/**
 * Structured logging tool arguments
 */
export interface LogQueryArgs {
  level?: string
  limit?: number
  component?: string
}

export interface LogLevelArgs {
  action?: string
  new_level?: string
}

/**
 * Type guards for utility types
 */
export const TypeGuards = {
  isObject: (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  },

  isArray: (value: unknown): value is unknown[] => {
    return Array.isArray(value)
  },

  isString: (value: unknown): value is string => {
    return typeof value === 'string'
  },

  isNumber: (value: unknown): value is number => {
    return typeof value === 'number' && !Number.isNaN(value)
  },

  isBoolean: (value: unknown): value is boolean => {
    return typeof value === 'boolean'
  },

  isSafeValue: (value: unknown): value is SafeValue => {
    if (value === null || value === undefined) return true
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return true
    }
    if (Array.isArray(value)) {
      return value.every(TypeGuards.isSafeValue)
    }
    if (TypeGuards.isObject(value)) {
      return Object.values(value).every(TypeGuards.isSafeValue)
    }
    return false
  },
}
