# @hatago/plugin-logger

Structured logging plugin for Hatago.

## Overview

This plugin provides enhanced structured logging capabilities for Hatago MCP servers, including request/response logging, performance metrics, error tracking, and log aggregation.

## Features

- **📝 Structured Logging**: JSON format with customizable fields
- **🔍 Request Tracing**: Correlation IDs and request lifecycle tracking
- **📊 Performance Metrics**: Response times and throughput monitoring
- **🚨 Error Tracking**: Detailed error logging with stack traces
- **🎯 Log Levels**: Configurable log levels and filtering
- **📡 Remote Logging**: Integration with log aggregation services

## Installation

```bash
npm install @hatago/plugin-logger
```

## Usage

### Basic Usage

```typescript
import { createApp } from '@hatago/core'
import { loggerPlugin } from '@hatago/plugin-logger'

const { app, server } = await createApp({
  plugins: [
    loggerPlugin({
      level: 'info',
      format: 'json',
    }),
  ],
})
```

### Advanced Configuration

```typescript
import { loggerPlugin } from '@hatago/plugin-logger'

const plugin = loggerPlugin({
  level: 'debug',
  format: 'json',

  // Request logging
  requestLogging: {
    enabled: true,
    includeBody: false,
    includeHeaders: ['user-agent', 'authorization'],
  },

  // Performance tracking
  performance: {
    enabled: true,
    slowRequestThreshold: 1000,
  },

  // Remote logging
  remote: {
    enabled: true,
    endpoint: 'https://logs.example.com/api/logs',
    apiKey: process.env.LOG_API_KEY,
  },
})
```

## Configuration Options

### Basic Settings

```typescript
interface LoggerConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  format: 'json' | 'pretty'
  timestamp: boolean
  correlationId: boolean
}
```

### Request Logging

```typescript
interface RequestLoggingConfig {
  enabled: boolean
  includeBody: boolean
  includeHeaders: string[]
  maskSensitive: boolean
}
```

## MCP Tools

### `logs_query`

Query log entries.

```json
{
  "name": "logs_query",
  "arguments": {
    "level": "error",
    "since": "2025-01-16T10:00:00Z",
    "limit": 100
  }
}
```

### `logs_export`

Export logs to file.

```json
{
  "name": "logs_export",
  "arguments": {
    "format": "json",
    "timeRange": {
      "start": "2025-01-16T00:00:00Z",
      "end": "2025-01-16T23:59:59Z"
    }
  }
}
```

## License

MIT
