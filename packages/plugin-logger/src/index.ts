import type { CapabilityAwarePluginFactory, PluginContext } from '@hatago/core'

export interface LoggerConfig {
  /** Log level filter */
  level?: 'debug' | 'info' | 'warn' | 'error'
  /** Whether to include timestamps */
  timestamp?: boolean
  /** Additional fixed fields to include */
  fields?: Record<string, unknown>
  /** Output format */
  format?: 'json' | 'pretty'
}

/**
 * Structured logger plugin that enhances the default logger capability
 * Outputs JSON Lines format for structured logging
 */
const structuredLogger: CapabilityAwarePluginFactory = (context: PluginContext) => {
  const config: LoggerConfig = context.config as LoggerConfig

  return async ({ server, capabilities }) => {
    const { logger } = capabilities

    // Register a tool for testing logger functionality
    server.registerTool(
      'logger.test',
      {
        title: 'Test Logger',
        description: 'Test structured logging functionality',
        inputSchema: {},
      },
      async (args: any) => {
        const { level = 'info', message, metadata } = args

        // Use the logger capability
        switch (level) {
          case 'debug':
            logger.debug(message, metadata)
            break
          case 'info':
            logger.info(message, metadata)
            break
          case 'warn':
            logger.warn(message, metadata)
            break
          case 'error':
            logger.error(message, metadata)
            break
        }

        return {
          content: [
            {
              type: 'text',
              text: `Logged ${level} message: "${message}"`,
            },
          ],
        }
      }
    )

    // Enhanced logger implementation
    const originalLogger = logger
    const enhancedLogger = createEnhancedLogger(originalLogger, config, context)

    // Replace logger capability (demonstration of capability enhancement)
    Object.assign(capabilities, { logger: enhancedLogger })

    logger.info('Structured logger plugin initialized', {
      pluginName: context.manifest.name,
      config: config,
      runtime: context.runtime,
    })
  }
}

function createEnhancedLogger(_baseLogger: any, config: LoggerConfig, context: PluginContext) {
  const logLevel = getLogLevelNumber(config.level || 'info')
  const pluginName = context.manifest.name

  function createLogEntry(level: string, message: string, meta?: object) {
    const entry: Record<string, unknown> = {
      level,
      message,
      plugin: pluginName,
      runtime: context.runtime,
      ...(config.fields || {}),
    }

    if (config.timestamp !== false) {
      entry.timestamp = new Date().toISOString()
    }

    if (meta) {
      entry.meta = meta
    }

    return entry
  }

  function shouldLog(level: string): boolean {
    return getLogLevelNumber(level) >= logLevel
  }

  function outputLog(entry: Record<string, unknown>) {
    if (config.format === 'pretty') {
      // Pretty format for development
      const timestamp = entry.timestamp ? `[${entry.timestamp}] ` : ''
      const level = (entry.level as string).toUpperCase().padEnd(5)
      const plugin = `[${entry.plugin}]`
      const message = entry.message
      const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''

      console.log(`${timestamp}${level} ${plugin} ${message}${meta}`)
    } else {
      // JSON Lines format (default)
      console.log(JSON.stringify(entry))
    }
  }

  return {
    debug: (message: string, meta?: object) => {
      if (shouldLog('debug')) {
        const entry = createLogEntry('debug', message, meta)
        outputLog(entry)
      }
    },
    info: (message: string, meta?: object) => {
      if (shouldLog('info')) {
        const entry = createLogEntry('info', message, meta)
        outputLog(entry)
      }
    },
    warn: (message: string, meta?: object) => {
      if (shouldLog('warn')) {
        const entry = createLogEntry('warn', message, meta)
        outputLog(entry)
      }
    },
    error: (message: string, meta?: object) => {
      if (shouldLog('error')) {
        const entry = createLogEntry('error', message, meta)
        outputLog(entry)
      }
    },
  }
}

function getLogLevelNumber(level: string): number {
  switch (level) {
    case 'debug':
      return 0
    case 'info':
      return 1
    case 'warn':
      return 2
    case 'error':
      return 3
    default:
      return 1
  }
}

export default structuredLogger
