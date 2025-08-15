import type { Context, Next } from 'hono'

/**
 * Correlation ID middleware for request tracing
 * Generates or extracts correlation ID from headers
 */
export function correlationId() {
  return async (c: Context, next: Next) => {
    // Get existing correlation ID or generate new one
    const correlationId = 
      c.req.header('x-correlation-id') ||
      c.req.header('x-request-id') ||
      crypto.randomUUID()

    // Set correlation ID in response headers
    c.res.headers.set('x-correlation-id', correlationId)

    // Store in context for use by other middleware/handlers
    c.set('correlationId', correlationId)

    // Add correlation ID to console logs
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    }

    // Wrap console methods to include correlation ID
    const wrapConsoleMethod = (method: any) => {
      return (...args: any[]) => {
        const timestamp = new Date().toISOString()
        const prefix = `[${timestamp}] [${correlationId}]`
        originalConsole[method as keyof typeof originalConsole](prefix, ...args)
      }
    }

    console.log = wrapConsoleMethod('log')
    console.info = wrapConsoleMethod('info')
    console.warn = wrapConsoleMethod('warn')
    console.error = wrapConsoleMethod('error')
    console.debug = wrapConsoleMethod('debug')

    try {
      await next()
    } finally {
      // Restore original console methods
      Object.assign(console, originalConsole)
    }
  }
}

/**
 * Get correlation ID from Hono context
 */
export function getCorrelationId(c: Context): string {
  return c.get('correlationId') as string
}