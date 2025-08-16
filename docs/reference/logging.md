# Hatago Logging Reference

Logging system for Hatago using functional programming patterns.

## Overview

Hatago provides two logging implementations:

- **Basic Logger** - Lightweight, pure functional logger
- **Secure Logger** - Advanced logger with PII masking

Both follow functional programming principles with factory functions and immutable configuration.

## Basic Logger

### Creating a Logger

```typescript
import { createLogger } from '@hatago/core'

const logger = createLogger({
  level: 'info',
  format: 'pretty',
})

// Use the logger
logger.info('Server started', { port: 8787 })
```

### Configuration

```typescript
interface LoggerConfig {
  level: LogLevel // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  format?: 'json' | 'pretty'
  component?: string // Component name for context
}
```

### Log Levels

```typescript
enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}
```

### Logger Methods

```typescript
interface Logger {
  trace(message: string, meta?: object): void
  debug(message: string, meta?: object): void
  info(message: string, meta?: object): void
  warn(message: string, meta?: object): void
  error(message: string, meta?: object): void
  fatal(message: string, meta?: object): void
}
```

### Example Usage

```typescript
const logger = createLogger({ level: 'debug' })

logger.debug('Processing request', {
  method: 'GET',
  path: '/api/users',
})

logger.info('Request completed', {
  status: 200,
  duration: 42,
})

logger.error('Database connection failed', {
  error: 'Connection timeout',
  retries: 3,
})
```

## Secure Logger

### Creating a Secure Logger

```typescript
import { createSecureLogger } from '@hatago/core'

const logger = createSecureLogger({
  level: 'info',
  maskingEnabled: true,
  redactKeys: ['password', 'token', 'secret'],
})

// PII is automatically masked
logger.info('User login', {
  email: 'user@example.com', // Will be masked
  password: 'secret123', // Will be redacted
})
```

### Configuration

```typescript
interface SecureLoggerConfig extends LoggerConfig {
  maskingEnabled?: boolean // Enable PII masking
  redactKeys?: string[] // Keys to redact
  sampleRate?: number // Log sampling (0-1)
}
```

### PII Masking

The secure logger automatically masks:

- Email addresses
- Phone numbers
- Credit card numbers
- Social security numbers
- API keys and tokens
- Custom patterns

```typescript
logger.info('User data', {
  email: 'john@example.com', // → 'j***@e******.com'
  phone: '+1-555-123-4567', // → '+*-***-***-****'
  ssn: '123-45-6789', // → '***-**-****'
  apiKey: 'sk-1234567890', // → 'sk-**********'
})
```

## Environment Variables

### Configuration via Environment

```bash
LOG_LEVEL=debug          # Set log level
LOG_FORMAT=json         # Output format
NOREN_MASKING=true      # Enable PII masking
LOG_SAMPLE_RATE=0.1     # Sample 10% of logs
```

### Using in Code

```typescript
const logger = createLogger({
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  format: (process.env.LOG_FORMAT as 'json' | 'pretty') || 'json',
})
```

## Plugin Integration

### Using Logger in Plugins

```typescript
import type { HatagoPlugin } from '@hatago/core'
import { createLogger } from '@hatago/core'

export function createLoggingPlugin(): HatagoPlugin {
  const logger = createLogger({
    level: 'info',
    component: 'my-plugin',
  })

  return ctx => {
    logger.info('Plugin initialized')

    ctx.server.registerTool(
      'logged_tool',
      {
        /* schema */
      },
      async args => {
        logger.debug('Tool called', { args })

        try {
          const result = await process(args)
          logger.info('Tool succeeded', { result })
          return { content: [{ type: 'text', text: result }] }
        } catch (error) {
          logger.error('Tool failed', { error: error.message })
          throw error
        }
      }
    )
  }
}
```

## Output Formats

### JSON Format (Production)

```json
{
  "timestamp": "2025-08-16T10:30:45.123Z",
  "level": 2,
  "component": "hatago-core",
  "message": "Request completed",
  "meta": {
    "method": "POST",
    "path": "/mcp",
    "status": 200,
    "duration": 42
  }
}
```

### Pretty Format (Development)

```
[10:30:45] INFO [hatago-core]: Request completed
  method: POST
  path: /mcp
  status: 200
  duration: 42
```

## Advanced Features

### Child Loggers

Create scoped loggers with context:

```typescript
function createChildLogger(parent: Logger, component: string): Logger {
  return createLogger({
    ...parent.config,
    component,
  })
}

const mainLogger = createLogger({ level: 'info' })
const dbLogger = createChildLogger(mainLogger, 'database')
const apiLogger = createChildLogger(mainLogger, 'api')
```

### Request Tracing

Add trace IDs for request correlation:

```typescript
export const tracingPlugin: HatagoPlugin = ctx => {
  const logger = createLogger({ level: 'info' })

  ctx.app.use(async (c, next) => {
    const traceId = `trace-${Date.now()}-${Math.random()}`

    // Create logger with trace context
    const requestLogger = createLogger({
      level: 'info',
      component: `request-${traceId}`,
    })

    requestLogger.info('Request started', {
      method: c.req.method,
      path: c.req.path,
    })

    await next()

    requestLogger.info('Request completed', {
      status: c.res.status,
    })
  })
}
```

### Log Aggregation

Send logs to external services:

```typescript
function createRemoteLogger(config: LoggerConfig): Logger {
  const baseLogger = createLogger(config)

  return {
    ...baseLogger,
    info: (message: string, meta?: object) => {
      baseLogger.info(message, meta)
      // Send to remote service
      sendToRemote({ level: 'info', message, meta })
    },
    // ... other methods
  }
}
```

## Performance Considerations

### Log Sampling

Reduce log volume in production:

```typescript
const logger = createSecureLogger({
  level: 'info',
  sampleRate: 0.1, // Log only 10% of non-error messages
})
```

### Async Logging

Non-blocking log operations:

```typescript
function createAsyncLogger(config: LoggerConfig): Logger {
  const queue: LogEntry[] = []

  // Process queue periodically
  setInterval(() => {
    if (queue.length > 0) {
      const entries = queue.splice(0, queue.length)
      entries.forEach(entry => console.log(JSON.stringify(entry)))
    }
  }, 1000)

  return {
    info: (message: string, meta?: object) => {
      queue.push({ level: 'info', message, meta, timestamp: new Date() })
    },
    // ... other methods
  }
}
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
logger.trace('Detailed debug info') // Very verbose
logger.debug('Debug information') // Development
logger.info('Normal operations') // Production
logger.warn('Warning conditions') // Potential issues
logger.error('Error conditions') // Errors
logger.fatal('Fatal errors') // System failures
```

### 2. Structure Log Data

```typescript
// ✅ Good - Structured data
logger.info('User action', {
  userId: user.id,
  action: 'login',
  timestamp: Date.now(),
})

// ❌ Bad - Unstructured string
logger.info(`User ${user.id} logged in at ${Date.now()}`)
```

### 3. Avoid Logging Sensitive Data

```typescript
// ✅ Good - Mask sensitive data
const secureLogger = createSecureLogger({ maskingEnabled: true })
secureLogger.info('User authenticated', { email: user.email })

// ❌ Bad - Log raw sensitive data
logger.info('User authenticated', {
  email: user.email,
  password: user.password, // Never log passwords!
})
```

### 4. Use Context

```typescript
// ✅ Good - Include context
logger.error('Database query failed', {
  query: 'SELECT * FROM users',
  error: error.message,
  duration: queryTime,
  retries: retryCount,
})

// ❌ Bad - No context
logger.error('Query failed')
```

## Testing

### Mock Logger for Tests

```typescript
function createMockLogger(): Logger & { logs: LogEntry[] } {
  const logs: LogEntry[] = []

  return {
    logs,
    info: (message, meta) => {
      logs.push({ level: 'info', message, meta })
    },
    // ... other methods
  }
}

// In tests
const logger = createMockLogger()
myFunction(logger)
expect(logger.logs).toContainEqual({
  level: 'info',
  message: 'Expected message',
  meta: { key: 'value' },
})
```

## Troubleshooting

### No Logs Appearing

1. Check log level: `LOG_LEVEL=trace`
2. Verify logger creation
3. Check output stream
4. Confirm sampling rate

### Performance Issues

1. Reduce log level in production
2. Enable sampling
3. Use async logging
4. Batch log writes

### Missing Context

1. Use child loggers
2. Add trace IDs
3. Include relevant metadata
4. Structure log data properly

## Related Documentation

- [Architecture](../architecture.md)
- [Plugin Development](../guides/plugin-development.md)
- [API Reference](../api-reference.md)
