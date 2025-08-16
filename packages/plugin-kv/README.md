# @hatago/plugin-kv

Key-value storage abstraction plugin for Hatago.

## Overview

This plugin provides a unified key-value storage interface for Hatago MCP servers, supporting multiple storage backends including memory, file system, Redis, and cloud storage services.

## Features

- **🔄 Multiple Backends**: Memory, filesystem, Redis, cloud storage
- **🔒 Type Safety**: TypeScript support with serialization
- **⚡ Performance**: Caching and connection pooling
- **🛡️ Security**: Encryption and access control
- **📊 Monitoring**: Storage metrics and health checks

## Installation

```bash
npm install @hatago/plugin-kv
```

## Usage

### Basic Usage

```typescript
import { createApp } from '@hatago/core'
import { kvPlugin } from '@hatago/plugin-kv'

const { app, server } = await createApp({
  plugins: [
    kvPlugin({
      backend: 'memory',
    }),
  ],
})
```

### With Redis Backend

```typescript
import { kvPlugin } from '@hatago/plugin-kv'

const plugin = kvPlugin({
  backend: 'redis',
  redis: {
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD,
  },
})
```

## Configuration

### Memory Backend

```typescript
const plugin = kvPlugin({
  backend: 'memory',
  memory: {
    maxSize: 1000,
    ttl: 3600000, // 1 hour
  },
})
```

### File System Backend

```typescript
const plugin = kvPlugin({
  backend: 'filesystem',
  filesystem: {
    directory: './data/kv',
    compression: 'gzip',
  },
})
```

### Redis Backend

```typescript
const plugin = kvPlugin({
  backend: 'redis',
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0,
    keyPrefix: 'hatago:',
    maxRetries: 3,
  },
})
```

## MCP Tools

The plugin registers several MCP tools for key-value operations:

### `kv_get`

Get value by key.

```json
{
  "name": "kv_get",
  "arguments": {
    "key": "user:123",
    "default": null
  }
}
```

### `kv_set`

Set key-value pair.

```json
{
  "name": "kv_set",
  "arguments": {
    "key": "user:123",
    "value": { "name": "John", "age": 30 },
    "ttl": 3600
  }
}
```

### `kv_delete`

Delete key.

```json
{
  "name": "kv_delete",
  "arguments": {
    "key": "user:123"
  }
}
```

### `kv_list`

List keys with pattern.

```json
{
  "name": "kv_list",
  "arguments": {
    "pattern": "user:*",
    "limit": 100
  }
}
```

## License

MIT
