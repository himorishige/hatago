/**
 * Common types for all logger implementations
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
  format: 'json' | 'compact' | 'pretty'
  includeStackTrace: boolean
  redactFields: string[]
}

// Secure logger specific types
export type SecureLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
export type HatagoMode = 'stdio' | 'http'

export interface SecureLogEntry {
  time: string
  level: SecureLogLevel
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
  [key: string]: unknown
}

export interface SecureLoggerConfig {
  level: SecureLogLevel
  format: 'json' | 'pretty'
  transport: HatagoMode
  redactKeys: string[]
  sampleRate: number
}
