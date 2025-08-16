# @hatago/plugin-concurrency-limiter

Concurrency limiting plugin for Hatago with overload protection.

## Overview

This plugin provides sophisticated concurrency control and overload protection for Hatago MCP servers. It implements token bucket algorithms, circuit breaker patterns, and adaptive throttling to ensure server stability under high load.

## Features

- **🚦 Concurrency Control**: Limit concurrent requests per client/endpoint
- **🛡️ Overload Protection**: Circuit breaker pattern with automatic recovery
- **📊 Token Bucket**: Rate limiting with burst capacity
- **🔄 Adaptive Throttling**: Dynamic limits based on server performance
- **📈 Metrics**: Real-time concurrency and performance metrics
- **⚙️ Configurable**: Fine-tuned control over all limiting parameters

## Installation

```bash
npm install @hatago/plugin-concurrency-limiter
```

## Usage

### Basic Usage

```typescript
import { createApp } from '@hatago/core'
import { concurrencyLimiter } from '@hatago/plugin-concurrency-limiter'

const { app, server } = await createApp({
  plugins: [
    concurrencyLimiter({
      maxConcurrent: 10,
      queueSize: 50,
    }),
  ],
})
```

### Advanced Configuration

```typescript
import { concurrencyLimiter } from '@hatago/plugin-concurrency-limiter'

const plugin = concurrencyLimiter({
  // Basic limits
  maxConcurrent: 20,
  queueSize: 100,
  timeout: 30000,

  // Circuit breaker
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 60000,
    healthCheckInterval: 10000,
  },

  // Token bucket rate limiting
  rateLimiting: {
    tokensPerSecond: 10,
    burstCapacity: 50,
    refillInterval: 1000,
  },

  // Adaptive throttling
  adaptive: {
    enabled: true,
    cpuThreshold: 80,
    memoryThreshold: 85,
    responseTimeThreshold: 5000,
  },
})
```

## Configuration Options

### Basic Concurrency Control

```typescript
interface ConcurrencyConfig {
  // Maximum concurrent requests
  maxConcurrent: number // default: 10

  // Queue size for waiting requests
  queueSize: number // default: 50

  // Request timeout in milliseconds
  timeout: number // default: 30000

  // Enable per-client limits
  perClientLimits: boolean // default: false
}
```

### Circuit Breaker

```typescript
interface CircuitBreakerConfig {
  // Enable circuit breaker
  enabled: boolean // default: true

  // Failure threshold before opening circuit
  failureThreshold: number // default: 5

  // Time to wait before attempting recovery
  recoveryTimeout: number // default: 60000

  // Interval for health checks
  healthCheckInterval: number // default: 10000

  // Failure rate threshold (0-1)
  failureRateThreshold: number // default: 0.5
}
```

### Rate Limiting

```typescript
interface RateLimitingConfig {
  // Enable token bucket rate limiting
  enabled: boolean // default: true

  // Tokens added per second
  tokensPerSecond: number // default: 10

  // Maximum burst capacity
  burstCapacity: number // default: 20

  // Token refill interval
  refillInterval: number // default: 1000
}
```

### Adaptive Throttling

```typescript
interface AdaptiveConfig {
  // Enable adaptive throttling
  enabled: boolean // default: false

  // CPU usage threshold (0-100)
  cpuThreshold: number // default: 80

  // Memory usage threshold (0-100)
  memoryThreshold: number // default: 85

  // Response time threshold (ms)
  responseTimeThreshold: number // default: 5000

  // Check interval for system metrics
  checkInterval: number // default: 5000
}
```

## Examples

### Basic Rate Limiting

```typescript
import { concurrencyLimiter } from '@hatago/plugin-concurrency-limiter'

// Simple rate limiting
const plugin = concurrencyLimiter({
  maxConcurrent: 5,
  queueSize: 20,
  timeout: 10000,
})
```

### Per-Client Limits

```typescript
const plugin = concurrencyLimiter({
  maxConcurrent: 100, // Global limit
  perClientLimits: true, // Enable per-client tracking
  rateLimiting: {
    tokensPerSecond: 5, // 5 requests/second per client
    burstCapacity: 10, // Allow bursts of 10
  },
})
```

### Production Setup with Monitoring

```typescript
const plugin = concurrencyLimiter({
  maxConcurrent: 50,
  queueSize: 200,

  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    recoveryTimeout: 120000,
  },

  adaptive: {
    enabled: true,
    cpuThreshold: 75,
    memoryThreshold: 80,
  },

  metrics: {
    enabled: true,
    endpoint: '/metrics/concurrency',
  },
})
```

### Custom Error Handling

```typescript
const plugin = concurrencyLimiter({
  maxConcurrent: 10,

  onLimitExceeded: context => {
    console.log(`Limit exceeded for ${context.clientId}`)
    return {
      error: {
        code: -32000,
        message: 'Server overloaded, please try again later',
        data: {
          retryAfter: 60,
          queuePosition: context.queuePosition,
        },
      },
    }
  },

  onCircuitOpen: () => {
    console.log('Circuit breaker opened - server in protection mode')
  },
})
```

## Monitoring and Metrics

### Built-in Metrics

The plugin exposes metrics via HTTP endpoint (when enabled):

```bash
# Get concurrency metrics
curl http://localhost:8787/metrics/concurrency
```

Response:

```json
{
  "timestamp": "2025-01-16T10:30:00Z",
  "concurrency": {
    "current": 5,
    "max": 10,
    "queue": {
      "size": 2,
      "maxSize": 50
    }
  },
  "circuitBreaker": {
    "state": "closed",
    "failures": 0,
    "lastFailure": null
  },
  "rateLimiting": {
    "tokens": 8,
    "capacity": 20,
    "refillRate": 10
  },
  "performance": {
    "avgResponseTime": 150,
    "requestsPerSecond": 8.5,
    "errorRate": 0.02
  }
}
```

### Custom Metrics Integration

```typescript
const plugin = concurrencyLimiter({
  maxConcurrent: 10,

  onMetrics: metrics => {
    // Send to monitoring system
    prometheus.register.getSingleMetric('concurrent_requests')?.set(metrics.concurrency.current)

    datadog.increment('requests.queued', metrics.queue.size)
  },
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
      "retryAfter": 30,
      "limit": 10,
      "remaining": 0,
      "resetTime": "2025-01-16T10:35:00Z"
    }
  },
  "id": null
}
```

### Concurrency Limit Exceeded

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Server overloaded",
    "data": {
      "type": "concurrency_limit",
      "queuePosition": 15,
      "estimatedWait": 5000,
      "maxConcurrent": 10,
      "current": 10
    }
  },
  "id": null
}
```

### Circuit Breaker Open

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Service temporarily unavailable",
    "data": {
      "type": "circuit_breaker",
      "state": "open",
      "retryAfter": 60,
      "nextCheck": "2025-01-16T10:35:00Z"
    }
  },
  "id": null
}
```

## Best Practices

### Production Configuration

```typescript
// High-traffic production server
const plugin = concurrencyLimiter({
  // Conservative limits
  maxConcurrent: 20,
  queueSize: 100,
  timeout: 30000,

  // Robust circuit breaker
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000,
    failureRateThreshold: 0.3,
  },

  // Moderate rate limiting
  rateLimiting: {
    tokensPerSecond: 5,
    burstCapacity: 15,
  },

  // System-aware throttling
  adaptive: {
    enabled: true,
    cpuThreshold: 70,
    memoryThreshold: 75,
  },
})
```

### Development Configuration

```typescript
// Permissive development setup
const plugin = concurrencyLimiter({
  maxConcurrent: 100,
  queueSize: 500,

  circuitBreaker: {
    enabled: false, // Disable in development
  },

  rateLimiting: {
    tokensPerSecond: 100,
    burstCapacity: 200,
  },
})
```

### Per-Environment Configuration

```typescript
const isProd = process.env.NODE_ENV === 'production'

const plugin = concurrencyLimiter({
  maxConcurrent: isProd ? 20 : 100,
  queueSize: isProd ? 100 : 500,

  circuitBreaker: {
    enabled: isProd,
  },

  adaptive: {
    enabled: isProd,
    cpuThreshold: isProd ? 70 : 90,
  },
})
```

## Troubleshooting

### High Queue Times

```typescript
// Monitor queue metrics
const plugin = concurrencyLimiter({
  maxConcurrent: 10,

  onQueueChange: (queueSize, waitTime) => {
    if (waitTime > 5000) {
      console.warn(`High queue wait time: ${waitTime}ms`)
      // Consider scaling up
    }
  },
})
```

### Circuit Breaker Issues

```typescript
// Debug circuit breaker behavior
const plugin = concurrencyLimiter({
  circuitBreaker: {
    enabled: true,
    onStateChange: (oldState, newState, reason) => {
      console.log(`Circuit breaker: ${oldState} → ${newState} (${reason})`)
    },
  },
})
```

### Performance Tuning

```bash
# Monitor system resources
top -p $(pgrep node)

# Check network connections
netstat -an | grep :8787

# Monitor plugin metrics
curl http://localhost:8787/metrics/concurrency | jq .
```

## Integration Examples

### With Monitoring

```typescript
import { concurrencyLimiter } from '@hatago/plugin-concurrency-limiter'
import { prometheus } from 'prom-client'

const concurrentGauge = new prometheus.Gauge({
  name: 'hatago_concurrent_requests',
  help: 'Current concurrent requests',
})

const plugin = concurrencyLimiter({
  maxConcurrent: 10,
  onMetrics: metrics => {
    concurrentGauge.set(metrics.concurrency.current)
  },
})
```

### With Alerting

```typescript
const plugin = concurrencyLimiter({
  maxConcurrent: 10,

  onLimitExceeded: context => {
    // Send alert
    alerting.send({
      severity: 'warning',
      message: 'Concurrency limit exceeded',
      context,
    })
  },
})
```

## License

MIT

## Related Packages

- [@hatago/core](../core) - Core framework
- [@hatago/plugin-rate-limit](../plugin-rate-limit) - Simple rate limiting
- [@hatago/plugin-metrics](../plugin-metrics) - Metrics collection
