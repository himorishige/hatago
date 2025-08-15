import type { HatagoPlugin, HatagoPluginFactory } from '../types.js'

/**
 * Log levels following RFC 5424 Syslog severity levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Core log entry structure
 */
export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string
  /** Log level */
  level: LogLevel
  /** Human-readable message */
  message: string
  /** Structured metadata */
  meta?: Record<string, unknown>
  /** Request/trace ID for correlation */
  trace_id?: string
  /** Component/plugin that generated the log */
  component?: string
  /** Error stack trace if applicable */
  error?: {
    name: string
    message: string
    stack?: string
  }
}

/**
 * Configuration for structured logging
 */
export interface StructuredLoggingConfig {
  /** Enable structured logging */
  enabled?: boolean
  /** Minimum log level to output */
  level?: LogLevel
  /** Output format */
  format?: 'json' | 'compact'
  /** Log endpoint path */
  endpoint?: string
  /** Include stack traces for errors */
  includeStackTrace?: boolean
  /** Maximum log buffer size */
  bufferSize?: number
  /** Fields to redact from logs */
  redactFields?: string[]
}

/**
 * Lightweight structured logging plugin
 * Focuses on operational visibility with minimal overhead
 */
export const structuredLogging: HatagoPluginFactory<StructuredLoggingConfig> =
  (config: StructuredLoggingConfig = {}): HatagoPlugin =>
  ({ app, server, getBaseUrl }) => {
    const {
      enabled = true,
      level = LogLevel.INFO,
      format = 'json',
      endpoint = '/logs',
      includeStackTrace = true,
      bufferSize = 1000,
      redactFields = ['password', 'token', 'secret', 'key', 'authorization'],
    } = config

    if (!enabled) {
      return
    }

    // In-memory log buffer (circular buffer)
    const logBuffer: LogEntry[] = []
    let bufferIndex = 0

    // Helper functions
    const shouldLog = (logLevel: LogLevel): boolean => logLevel >= level

    const redactSensitiveData = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj
      }

      if (Array.isArray(obj)) {
        return obj.map(redactSensitiveData)
      }

      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase()
        if (redactFields.some(field => lowerKey.includes(field))) {
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
        component: 'hatago-core',
      }

      if (meta) {
        entry.meta = redactSensitiveData(meta)
      }

      if (error && includeStackTrace) {
        entry.error = {
          name: error.name,
          message: error.message,
          ...(error.stack && { stack: error.stack }),
        }
      }

      return entry
    }

    const addToBuffer = (entry: LogEntry): void => {
      logBuffer[bufferIndex] = entry
      bufferIndex = (bufferIndex + 1) % bufferSize
    }

    const formatLogEntry = (entry: LogEntry): string => {
      if (format === 'json') {
        return JSON.stringify(entry)
      }

      // Compact format for development
      const levelName = LogLevel[entry.level]
      const timestamp = entry.timestamp.split('T')[1]?.split('.')[0] || ''
      const component = entry.component ? `[${entry.component}]` : ''
      const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''

      return `${timestamp} ${levelName} ${component} ${entry.message}${meta}`
    }

    // Core logger implementation
    const logger = {
      debug: (message: string, meta?: Record<string, unknown>) => {
        if (!shouldLog(LogLevel.DEBUG)) return
        const entry = createLogEntry(LogLevel.DEBUG, message, meta)
        addToBuffer(entry)
        console.debug(formatLogEntry(entry))
      },

      info: (message: string, meta?: Record<string, unknown>) => {
        if (!shouldLog(LogLevel.INFO)) return
        const entry = createLogEntry(LogLevel.INFO, message, meta)
        addToBuffer(entry)
        console.info(formatLogEntry(entry))
      },

      warn: (message: string, meta?: Record<string, unknown>) => {
        if (!shouldLog(LogLevel.WARN)) return
        const entry = createLogEntry(LogLevel.WARN, message, meta)
        addToBuffer(entry)
        console.warn(formatLogEntry(entry))
      },

      error: (message: string, meta?: Record<string, unknown>, error?: Error) => {
        if (!shouldLog(LogLevel.ERROR)) return
        const entry = createLogEntry(LogLevel.ERROR, message, meta, error)
        addToBuffer(entry)
        console.error(formatLogEntry(entry))
      },
    }

    // HTTP endpoint for log retrieval
    app.get(endpoint, c => {
      const query = c.req.query()
      const levelFilter = query.level ? parseInt(query.level) : undefined
      const limit = query.limit ? parseInt(query.limit) : 100
      const since = query.since ? new Date(query.since) : undefined

      // Get logs from buffer (most recent first)
      const logs = logBuffer
        .filter(Boolean) // Remove empty slots
        .filter(entry => {
          if (levelFilter !== undefined && entry.level < levelFilter) return false
          if (since && new Date(entry.timestamp) < since) return false
          return true
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit)

      return c.json({
        logs,
        total: logs.length,
        buffer_size: bufferSize,
        current_level: LogLevel[level],
      })
    })

    // Register log management tool
    server.registerTool(
      'logs.query',
      {
        title: 'Query Logs',
        description: 'Query structured logs with filtering options',
        inputSchema: {},
      },
      async (args: any) => {
        const { level: levelFilter, limit = 50, component } = args

        const logs = logBuffer
          .filter(Boolean)
          .filter(entry => {
            if (levelFilter && LogLevel[levelFilter.toUpperCase()] !== undefined) {
              const filterLevel = LogLevel[levelFilter.toUpperCase() as keyof typeof LogLevel]
              if (entry.level < filterLevel) return false
            }
            if (component && entry.component !== component) return false
            return true
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  logs: logs.map(log => formatLogEntry(log)),
                  total: logs.length,
                  filters: { level: levelFilter, component },
                  available_levels: Object.keys(LogLevel).filter(k => isNaN(Number(k))),
                },
                null,
                2
              ),
            },
          ],
        }
      }
    )

    // Register log configuration tool
    server.registerTool(
      'logs.config',
      {
        title: 'Log Configuration',
        description: 'Get or update logging configuration',
        inputSchema: {},
      },
      async (args: any) => {
        const { action, new_level } = args

        if (action === 'set_level' && new_level) {
          const levelNum = LogLevel[new_level.toUpperCase() as keyof typeof LogLevel]
          if (levelNum !== undefined) {
            // Note: This would need to be implemented with proper config management
            return {
              content: [
                {
                  type: 'text',
                  text: `Log level would be updated to ${new_level} (${levelNum}). Implementation requires config persistence.`,
                },
              ],
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  current_config: {
                    enabled,
                    level: LogLevel[level],
                    format,
                    endpoint,
                    buffer_size: bufferSize,
                    include_stack_trace: includeStackTrace,
                  },
                  buffer_usage: `${logBuffer.filter(Boolean).length}/${bufferSize}`,
                  available_actions: ['set_level'],
                  available_levels: Object.keys(LogLevel).filter(k => isNaN(Number(k))),
                },
                null,
                2
              ),
            },
          ],
        }
      }
    )

    // Initialize logging
    logger.info('Structured logging initialized', {
      plugin: 'structured-logging',
      level: LogLevel[level],
      format,
      endpoint,
      buffer_size: bufferSize,
    })

    // Hook into request/response cycle for access logging
    app.use('*', async (c, next) => {
      const start = Date.now()
      const traceId =
        c.req.header('x-trace-id') || `trace-${Date.now()}-${Math.random().toString(36).slice(2)}`

      // Set trace ID for downstream use (cast to any to avoid Hono typing issues)
      ;(c as any).set('traceId', traceId)

      logger.debug('Request started', {
        method: c.req.method,
        path: c.req.path,
        user_agent: c.req.header('user-agent'),
        trace_id: traceId,
      })

      try {
        await next()

        const duration = Date.now() - start
        const status = c.res.status

        logger.info('Request completed', {
          method: c.req.method,
          path: c.req.path,
          status,
          duration_ms: duration,
          trace_id: traceId,
        })
      } catch (error) {
        const duration = Date.now() - start

        logger.error(
          'Request failed',
          {
            method: c.req.method,
            path: c.req.path,
            duration_ms: duration,
            trace_id: traceId,
          },
          error instanceof Error ? error : new Error(String(error))
        )

        throw error
      }
    })

    // Export logger for other plugins to use
    // Note: This would need proper dependency injection in a real implementation
    if (typeof globalThis !== 'undefined') {
      ;(globalThis as any).__hatago_logger = logger
    }
  }
