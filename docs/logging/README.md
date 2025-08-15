# Hatago Structured Logging

Lightweight, runtime-agnostic structured logging for Hatago MCP Server with minimal overhead and operational focus.

## Overview

Hatago's logging system provides:

- **Structured JSON logs** for production environments
- **Compact logs** for development
- **Automatic request tracing** with correlation IDs
- **Sensitive data redaction** for security
- **In-memory log buffering** for query capabilities
- **SLO-aware log levels** aligned with monitoring

## Quick Start

### Basic Usage

```typescript
import { createLogger, LogLevel } from '@hatago/core'

// Create logger with component name
const logger = createLogger(
  {
    level: LogLevel.INFO,
    format: 'json',
    includeStackTrace: true,
    redactFields: ['password', 'token'],
  },
  'my-plugin'
)

// Log messages with structured metadata
logger.info('User authenticated', {
  user_id: '12345',
  method: 'oauth2',
  ip_address: '192.168.1.100',
})

logger.error(
  'Database connection failed',
  {
    database: 'users',
    retry_count: 3,
  },
  new Error('Connection timeout')
)
```

### Plugin Integration

```typescript
import { structuredLogging } from '@hatago/core'

// Add to plugin configuration
export function createMyPlugin(): HatagoPlugin {
  return structuredLogging({
    enabled: true,
    level: LogLevel.INFO,
    format: 'json',
    endpoint: '/logs',
    bufferSize: 1000,
  })
}
```

## Log Levels

Following RFC 5424 Syslog severity levels:

| Level | Value | Usage                          |
| ----- | ----- | ------------------------------ |
| DEBUG | 0     | Detailed debugging information |
| INFO  | 1     | General operational messages   |
| WARN  | 2     | Warning conditions             |
| ERROR | 3     | Error conditions               |

## Log Entry Structure

```typescript
interface LogEntry {
  timestamp: string // ISO 8601 format
  level: LogLevel // Numeric log level
  message: string // Human-readable message
  meta?: Record<string, unknown> // Structured metadata
  component?: string // Component/plugin name
  trace_id?: string // Request correlation ID
  error?: {
    // Error details (if applicable)
    name: string
    message: string
    stack?: string
  }
}
```

## Example Log Outputs

### JSON Format (Production)

```json
{
  "timestamp": "2024-08-15T10:30:45.123Z",
  "level": 1,
  "message": "Request completed",
  "component": "hatago-core",
  "trace_id": "trace-1692097845123-abc123",
  "meta": {
    "method": "POST",
    "path": "/mcp",
    "status": 200,
    "duration_ms": 42,
    "user_agent": "claude-code/1.0"
  }
}
```

### Compact Format (Development)

```
10:30:45 INFO [hatago-core] Request completed {"method":"POST","path":"/mcp","status":200,"duration_ms":42}
```

## Configuration

### Environment Variables

```bash
# Log level
LOG_LEVEL=debug          # debug, info, warn, error
NODE_ENV=production      # Affects format and stack traces

# Structured logging plugin
HATAGO_LOG_ENABLED=true
HATAGO_LOG_FORMAT=json   # json, compact
HATAGO_LOG_BUFFER_SIZE=1000
```

### Plugin Configuration

```typescript
structuredLogging({
  enabled: true,
  level: LogLevel.INFO,
  format: 'json',
  endpoint: '/logs',
  includeStackTrace: true,
  bufferSize: 1000,
  redactFields: ['password', 'token', 'secret', 'key', 'authorization'],
})
```

## HTTP Endpoints

### Query Logs

```bash
# Get recent logs
curl "http://localhost:8787/logs?limit=50"

# Filter by level
curl "http://localhost:8787/logs?level=2&limit=25"

# Filter by time
curl "http://localhost:8787/logs?since=2024-08-15T10:00:00Z"
```

Response:

```json
{
  "logs": [...],
  "total": 25,
  "buffer_size": 1000,
  "current_level": "INFO"
}
```

## MCP Tools

### Query Logs Tool

```bash
# Via MCP
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "logs.query",
    "arguments": {
      "level": "warn",
      "limit": 20,
      "component": "oauth-metadata"
    }
  }
}
```

### Log Configuration Tool

```bash
# Get current config
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "logs.config",
    "arguments": {
      "action": "get"
    }
  }
}
```

## Security Features

### Automatic Redaction

Sensitive fields are automatically redacted:

```typescript
logger.info('User login', {
  username: 'alice',
  password: 'secret123', // → '[REDACTED]'
  auth_token: 'abc123', // → '[REDACTED]'
  session_id: 'sess_456',
})
```

### Configurable Redaction

```typescript
const config = {
  redactFields: ['password', 'token', 'secret', 'key', 'authorization', 'cookie', 'credential'],
}
```

## Request Tracing

Automatic request correlation with trace IDs:

```typescript
// Automatic trace ID generation
app.use('*', async (c, next) => {
  const traceId = c.req.header('x-trace-id') || generateTraceId()
  c.set('traceId', traceId)

  logger.info('Request started', {
    method: c.req.method,
    path: c.req.path,
    trace_id: traceId,
  })

  await next()
})
```

## Performance Considerations

### Minimal Overhead

- **Zero dependencies** - Pure TypeScript implementation
- **Circular buffer** - Fixed memory usage
- **Conditional logging** - Level checks before processing
- **Lazy evaluation** - Metadata only processed when logging

### Memory Usage

```typescript
// Buffer size controls memory usage
bufferSize: 1000 // ~1MB for typical log entries
```

### Async Safety

- **Synchronous writes** - No async I/O blocking
- **Console delegation** - Platform-optimized output
- **Error isolation** - Logging failures don't crash app

## Integration Examples

### Plugin Development

```typescript
import { createLogger, LogLevel } from '@hatago/core'

export const myPlugin: HatagoPlugin = ({ server }) => {
  const logger = createLogger(
    {
      level: LogLevel.INFO,
      format: 'json',
      includeStackTrace: true,
      redactFields: ['password'],
    },
    'my-plugin'
  )

  server.registerTool(
    'my.tool',
    {
      title: 'My Tool',
      description: 'Example tool with logging',
      inputSchema: {},
    },
    async args => {
      logger.info('Tool called', { args })

      try {
        const result = await processRequest(args)
        logger.info('Tool completed', { result_size: result.length })
        return { content: [{ type: 'text', text: result }] }
      } catch (error) {
        logger.error('Tool failed', { args }, error)
        throw error
      }
    }
  )
}
```

### Error Handling

```typescript
try {
  await riskyOperation()
} catch (error) {
  logger.error(
    'Operation failed',
    {
      operation: 'user_sync',
      retry_count: 3,
      error_code: error.code,
    },
    error
  )

  // Log includes stack trace in development
  // JSON format in production for log aggregation
}
```

## Log Aggregation

### ELK Stack Integration

```json
{
  "timestamp": "2024-08-15T10:30:45.123Z",
  "level": 1,
  "message": "Request completed",
  "component": "hatago-core",
  "trace_id": "trace-1692097845123-abc123",
  "meta.method": "POST",
  "meta.status": 200,
  "meta.duration_ms": 42
}
```

### Prometheus Metrics

Logs integrate with metrics for observability:

```bash
# Log-derived metrics
rate(hatago_log_entries_total[5m])
increase(hatago_log_entries_total{level="error"}[1h])
```

## Best Practices

### 1. Appropriate Log Levels

```typescript
// DEBUG: Detailed debugging info
logger.debug('Cache lookup', { key, hit: false })

// INFO: Normal operations
logger.info('User authenticated', { user_id, method })

// WARN: Concerning but not breaking
logger.warn('Rate limit approaching', { current: 95, limit: 100 })

// ERROR: Error conditions
logger.error('Payment failed', { order_id, error_code }, error)
```

### 2. Structured Metadata

```typescript
// Good: Structured, searchable
logger.info('Order processed', {
  order_id: '12345',
  user_id: '67890',
  amount: 99.99,
  currency: 'USD',
  processing_time_ms: 150,
})

// Bad: Unstructured message
logger.info('Order 12345 for user 67890 processed in 150ms for $99.99 USD')
```

### 3. Error Context

```typescript
// Good: Rich context with error
logger.error(
  'Database query failed',
  {
    query_type: 'user_lookup',
    table: 'users',
    user_id: '12345',
    retry_count: 3,
  },
  error
)

// Bad: Minimal context
logger.error('Query failed', {}, error)
```

### 4. Performance Sensitive Operations

```typescript
// Conditional expensive operations
if (logger.level <= LogLevel.DEBUG) {
  logger.debug('Complex object state', {
    object: JSON.parse(JSON.stringify(complexObject)),
  })
}
```

## Troubleshooting

### Common Issues

**Logs not appearing**: Check log level configuration
**Sensitive data exposure**: Verify redact fields configuration
**Memory usage**: Adjust buffer size for your environment
**Performance impact**: Use appropriate log levels in production

### Debug Commands

```bash
# Check current log config
curl http://localhost:8787/mcp -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"logs.config"}}'

# View recent logs
curl "http://localhost:8787/logs?limit=10"

# Monitor log levels
curl "http://localhost:8787/logs" | jq '.logs[].level' | sort | uniq -c
```
