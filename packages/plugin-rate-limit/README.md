# @hatago/plugin-rate-limit

Rate limiting plugin for Hatago using token bucket algorithm.

## Overview

This plugin implements rate limiting for Hatago MCP servers using the token bucket algorithm. It provides flexible rate limiting with per-client tracking, burst capacity, and configurable time windows.

## Features

- **🪣 Token Bucket Algorithm**: Smooth rate limiting with burst capacity
- **👤 Per-Client Limits**: Individual rate limits per client/IP
- **⏰ Flexible Time Windows**: Configurable rate limit windows
- **📊 Metrics**: Rate limiting statistics and monitoring
- **🔧 Configurable**: Fine-tuned control over rate parameters
- **🚫 Custom Responses**: Customizable rate limit error messages

## Installation

```bash
npm install @hatago/plugin-rate-limit
```

## Usage

### Basic Usage

```typescript
import { createApp } from '@hatago/core'
import { rateLimitPlugin } from '@hatago/plugin-rate-limit'

const { app, server } = await createApp({
  plugins: [
    rateLimitPlugin({
      requestsPerMinute: 60,
      burstCapacity: 10,
    }),
  ],
})
```

### Advanced Configuration

```typescript
import { rateLimitPlugin } from '@hatago/plugin-rate-limit'

const plugin = rateLimitPlugin({
  // Basic rate limiting
  requestsPerMinute: 100,
  burstCapacity: 20,

  // Per-client tracking
  perClient: true,
  clientIdentifier: 'ip', // 'ip' | 'header' | 'custom'

  // Custom time windows
  windows: [
    { duration: 60000, limit: 100 }, // 100 requests per minute
    { duration: 3600000, limit: 1000 }, // 1000 requests per hour
    { duration: 86400000, limit: 10000 }, // 10000 requests per day
  ],

  // Custom error response
  onLimitExceeded: context => ({
    error: {
      code: -32000,
      message: 'Rate limit exceeded',
      data: {
        retryAfter: context.retryAfter,
        limit: context.limit,
        remaining: context.remaining,
      },
    },
  }),
})
```

## Configuration Options

### Basic Rate Limiting

```typescript
interface RateLimitConfig {
  // Requests per minute
  requestsPerMinute: number // default: 60

  // Burst capacity (tokens)
  burstCapacity: number // default: 10

  // Token refill interval (ms)
  refillInterval: number // default: 1000

  // Enable per-client limits
  perClient: boolean // default: true
}
```

### Client Identification

```typescript
interface ClientConfig {
  // How to identify clients
  clientIdentifier: 'ip' | 'header' | 'custom'

  // Header name (if using 'header')
  headerName?: string

  // Custom identifier function
  customIdentifier?: (request: Request) => string
}
```

### Multiple Time Windows

```typescript
interface TimeWindow {
  duration: number // Window duration in ms
  limit: number // Request limit for this window
}

interface RateLimitConfig {
  windows: TimeWindow[]
}
```

## Examples

### Simple Rate Limiting

```typescript
const plugin = rateLimitPlugin({
  requestsPerMinute: 30,
  burstCapacity: 5,
})
```

### Per-IP Rate Limiting

```typescript
const plugin = rateLimitPlugin({
  requestsPerMinute: 60,
  perClient: true,
  clientIdentifier: 'ip',
})
```

### API Key Based Limiting

```typescript
const plugin = rateLimitPlugin({
  requestsPerMinute: 1000,
  perClient: true,
  clientIdentifier: 'header',
  headerName: 'x-api-key',
})
```

### Multiple Time Windows

```typescript
const plugin = rateLimitPlugin({
  windows: [
    { duration: 60000, limit: 100 }, // 100/minute
    { duration: 3600000, limit: 1000 }, // 1000/hour
    { duration: 86400000, limit: 5000 }, // 5000/day
  ],
})
```

### Custom Error Response

```typescript
const plugin = rateLimitPlugin({
  requestsPerMinute: 60,

  onLimitExceeded: context => ({
    error: {
      code: -32429,
      message: `Rate limit exceeded. Try again in ${context.retryAfter} seconds.`,
      data: {
        type: 'rate_limit',
        limit: context.limit,
        remaining: context.remaining,
        resetTime: new Date(Date.now() + context.retryAfter * 1000).toISOString(),
      },
    },
  }),
})
```

## Error Responses

### Rate Limit Exceeded

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Rate limit exceeded",
    "data": {
      "type": "rate_limit",
      "limit": 60,
      "remaining": 0,
      "retryAfter": 45,
      "resetTime": "2025-01-16T10:35:00Z"
    }
  },
  "id": null
}
```

## Monitoring

### Rate Limit Metrics

```bash
# Get rate limiting metrics
curl http://localhost:8787/metrics/rate-limit
```

Response:

```json
{
  "timestamp": "2025-01-16T10:30:00Z",
  "global": {
    "requestsPerMinute": 45,
    "limit": 60,
    "tokensRemaining": 15
  },
  "clients": {
    "192.168.1.100": {
      "requests": 10,
      "remaining": 50,
      "resetTime": "2025-01-16T10:31:00Z"
    }
  }
}
```

### Headers

The plugin adds rate limit headers to responses:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1705401600
X-RateLimit-RetryAfter: 15
```

## Integration Examples

### With Prometheus Metrics

```typescript
import { rateLimitPlugin } from '@hatago/plugin-rate-limit'
import { prometheus } from 'prom-client'

const rateLimitCounter = new prometheus.Counter({
  name: 'hatago_rate_limit_exceeded_total',
  help: 'Total rate limit exceeded events',
})

const plugin = rateLimitPlugin({
  requestsPerMinute: 60,

  onLimitExceeded: context => {
    rateLimitCounter.inc()
    return {
      error: {
        code: -32000,
        message: 'Rate limit exceeded',
      },
    }
  },
})
```

### Environment-Based Configuration

```typescript
const plugin = rateLimitPlugin({
  requestsPerMinute: parseInt(process.env.RATE_LIMIT_RPM || '60'),
  burstCapacity: parseInt(process.env.RATE_LIMIT_BURST || '10'),
  perClient: process.env.RATE_LIMIT_PER_CLIENT === 'true',
})
```

## Best Practices

### Production Configuration

```typescript
const plugin = rateLimitPlugin({
  // Conservative limits
  requestsPerMinute: 60,
  burstCapacity: 10,

  // Per-client tracking
  perClient: true,
  clientIdentifier: 'ip',

  // Multiple time windows for better protection
  windows: [
    { duration: 60000, limit: 60 },
    { duration: 3600000, limit: 1000 },
  ],
})
```

### Development Configuration

```typescript
const isDev = process.env.NODE_ENV === 'development'

const plugin = rateLimitPlugin({
  requestsPerMinute: isDev ? 1000 : 60,
  burstCapacity: isDev ? 100 : 10,
  perClient: !isDev, // Disable per-client in dev
})
```

## Troubleshooting

### High Rate Limit Hits

```typescript
const plugin = rateLimitPlugin({
  requestsPerMinute: 60,

  onLimitExceeded: context => {
    console.warn(`Rate limit exceeded for ${context.clientId}`)
    return { error: { code: -32000, message: 'Rate limited' } }
  },
})
```

### Debugging Client Identification

```typescript
const plugin = rateLimitPlugin({
  requestsPerMinute: 60,
  clientIdentifier: 'custom',
  customIdentifier: request => {
    const clientId =
      request.headers.get('x-client-id') || request.headers.get('x-forwarded-for') || 'anonymous'
    console.log(`Client identified as: ${clientId}`)
    return clientId
  },
})
```

## License

MIT

## Related Packages

- [@hatago/core](../core) - Core framework
- [@hatago/plugin-concurrency-limiter](../plugin-concurrency-limiter) - Advanced concurrency control
